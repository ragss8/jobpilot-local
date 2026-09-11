"""Score generated JSON against frozen labels. Validation never approves serving.

MLX is imported only after argument parsing and corpus validation. The legacy v1
evaluator and its original report are preserved as historical artifacts.
"""
import argparse
import hashlib
import json
import platform
import time
from collections import defaultdict
from importlib.metadata import version
from pathlib import Path

from audit import audit
from schema import THRESHOLDS, request_text, score

ROOT = Path(__file__).resolve().parent


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def model_fingerprint(model):
    files = sorted(set(model.glob('*.safetensors')) | set(model.glob('*.json')) | set(model.glob('*.jinja')))
    return {path.name: sha256(path) for path in files}


def aggregate(outputs):
    return {key: sum(bool(row['checks'][key]) for row in outputs) / len(outputs) for key in THRESHOLDS}


def can_approve(report):
    """Recalculate gates from actual full test outcomes, ignoring approved flags."""
    if report.get('schema_version') != 2 or report.get('split') != 'test' or report.get('limit') != 0:
        return False
    runs = report.get('runs', {})
    if set(runs) != {'base', 'adapter'} or not report.get('corpus_audit_passed'):
        return False
    if not report.get('extended_schema') or report.get('rows', 0) < 100:
        return False
    computed = {}
    for name, run in runs.items():
        outputs = run.get('outputs', [])
        if len(outputs) != report['rows']:
            return False
        checked = []
        for output in outputs:
            checks = score(output['answer'], output['expected'], output['request'], extended=True)
            if checks != output['checks']:
                return False
            checked.append({**output, 'checks': checks})
        computed[name] = aggregate(checked)
        if computed[name] != run['metrics']:
            return False
    base, adapter = computed['base'], computed['adapter']
    if not all(adapter[key] >= threshold and adapter[key] >= base[key] for key, threshold in THRESHOLDS.items()):
        return False
    groups = defaultdict(lambda: {'base': [], 'adapter': []})
    for name, run in runs.items():
        for output in run['outputs']:
            groups[f"category:{output['category']}"][name].append(output)
            groups[f"project:{output['expected']['projectType']}"][name].append(output)
    return all(aggregate(values['adapter'])['exact'] >= aggregate(values['base'])['exact']
               for values in groups.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'data-v2')
    parser.add_argument('--model', type=Path, default=ROOT / 'models/qwen3-4b')
    parser.add_argument('--adapter', type=Path, default=ROOT / 'runs/request-v2')
    parser.add_argument('--split', choices=('valid', 'test'), default='valid')
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--max-tokens', type=int, default=1300)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--runs', choices=('both', 'base', 'adapter'), default='both')
    args = parser.parse_args()
    if args.limit < 0 or args.max_tokens < 1:
        parser.error('limit must be nonnegative and max-tokens positive')
    corpus = audit(args.data)
    if not corpus['passed']:
        raise ValueError(f'Corpus audit failed: {corpus["errors"]}')
    dataset = args.data / f'{args.split}.jsonl'
    rows = [json.loads(line) for line in dataset.read_text().splitlines()]
    if args.limit:
        rows = rows[:args.limit]
    if not rows:
        raise ValueError('Cannot evaluate an empty split')
    manifest = json.loads((args.data / 'manifest.json').read_text())
    suffix = '-sample' if args.limit else ''
    output = args.output or args.adapter / f'{args.split}{suffix}-evaluation.json'
    if output.exists():
        raise FileExistsError(f'Refusing to overwrite evaluation evidence: {output}')
    args.adapter.mkdir(exist_ok=True, parents=True)
    adapter_path = args.adapter / 'adapters.safetensors'
    report = {'schema_version': 2, 'split': args.split, 'limit': args.limit, 'rows': len(rows),
              'thresholds': THRESHOLDS, 'runs': {}, 'approved': False,
              'extended_schema': manifest.get('version') == 2, 'corpus_audit_passed': True,
              'dataset_sha256': sha256(dataset), 'dataset_manifest_sha256': sha256(args.data / 'manifest.json'),
              'system_sha256': hashlib.sha256(rows[0]['messages'][0]['content'].encode()).hexdigest(),
              'adapter_sha256': sha256(adapter_path) if adapter_path.exists() else None,
              'adapter_config_sha256': sha256(args.adapter / 'adapter_config.json') if (args.adapter / 'adapter_config.json').exists() else None,
              'model_files': model_fingerprint(args.model), 'sampler': {'temperature': 0, 'max_tokens': args.max_tokens, 'enable_thinking': False},
              'environment': {'python': platform.python_version(), 'mlx': version('mlx'), 'mlx-lm': version('mlx-lm')},
              'started_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    import mlx.core as mx
    from mlx_lm import generate, load
    from mlx_lm.sample_utils import make_sampler
    choices = [('base', None), ('adapter', str(args.adapter))]
    if args.runs != 'both':
        choices = [choice for choice in choices if choice[0] == args.runs]
    for name, adapter in choices:
        started = time.monotonic()
        model, tokenizer = load(str(args.model), adapter_path=adapter)
        outputs = []
        for i, row in enumerate(rows):
            prompt = tokenizer.apply_chat_template(row['messages'][:-1], tokenize=False, add_generation_prompt=True, enable_thinking=False)
            answer = generate(model, tokenizer, prompt=prompt, max_tokens=args.max_tokens,
                              sampler=make_sampler(temp=0), verbose=False)
            target = json.loads(row['messages'][-1]['content'])
            checks = score(answer, target, request_text(row), extended=report['extended_schema'])
            outputs.append({'request': request_text(row), 'user_message': row['messages'][1]['content'],
                            'category': row.get('category', 'legacy-unlabelled'), 'expected': target,
                            'answer': answer, 'checks': checks})
            if (i + 1) % 12 == 0:
                print(name, i + 1, len(rows), aggregate(outputs), flush=True)
        groups = defaultdict(list)
        for record in outputs:
            groups[record['category']].append(record)
        report['runs'][name] = {'metrics': aggregate(outputs), 'by_category': {key: {'rows': len(value), 'metrics': aggregate(value)} for key, value in groups.items()},
                                'elapsed_seconds': round(time.monotonic() - started, 2), 'outputs': outputs}
        output.write_text(json.dumps(report, indent=2) + '\n')
        del model
        mx.clear_cache()
    report['approved'] = can_approve(report)
    report['finished_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'path': str(output), 'approved': report['approved'],
                      'runs': {name: run['metrics'] for name, run in report['runs'].items()}}, indent=2), flush=True)


if __name__ == '__main__':
    main()
