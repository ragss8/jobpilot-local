"""Validate labels, snapshot hashes, duplicates and split provenance without MLX."""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from schema import request_text, validate


def audit(data):
    manifest = json.loads((data / 'manifest.json').read_text())
    seen_requests, seen_sources, seen_templates = {}, {}, {}
    errors, duplicates = [], []
    summaries = {}
    for split in ('train', 'valid', 'test'):
        path = data / f'{split}.jsonl'
        records = [json.loads(line) for line in path.read_text().splitlines()]
        meta = manifest['splits'][split]
        if meta['rows'] != len(records) or meta['sha256'] != hashlib.sha256(path.read_bytes()).hexdigest():
            errors.append(f'{split}: dataset hash or row count differs from manifest')
        categories, projects, intents, features = Counter(), Counter(), Counter(), Counter()
        for i, row in enumerate(records):
            target = json.loads(row['messages'][-1]['content'])
            request = request_text(row)
            problems = validate(target, request, extended=manifest.get('version') == 2)
            errors.extend(f'{split}:{i}: {problem}' for problem in problems)
            if hashlib.sha256(row['messages'][0]['content'].encode()).hexdigest() != manifest['system_sha256']:
                errors.append(f'{split}:{i}: system prompt differs from manifest')
            # User content includes active project, which changes edit semantics.
            key = ' '.join(row['messages'][1]['content'].lower().split())
            if key in seen_requests:
                previous = seen_requests[key]
                if previous != split:
                    errors.append(f'{split}:{i}: identical request overlaps {previous}')
                else:
                    duplicates.append(f'{split}:{i}')
            seen_requests[key] = split
            source = row.get('source', '')
            if source.startswith('ResPlan:'):
                if source in seen_sources and seen_sources[source] != split:
                    errors.append(f'{source}: canonical plan ID overlaps splits')
                seen_sources[source] = split
            family = row.get('templateFamily')
            if family:
                if family in seen_templates and seen_templates[family] != split:
                    errors.append(f'{family}: template family overlaps splits')
                seen_templates[family] = split
            categories[row.get('category', 'legacy-unlabelled')] += 1
            projects[target['projectType']] += 1
            intents[target['intent']] += 1
            features.update(f['kind'] for f in target['features'])
        summaries[split] = {'rows': len(records), 'categories': categories, 'projectTypes': projects,
                            'intents': intents, 'featureKinds': features}
    return {'passed': not errors, 'errors': errors, 'within_split_duplicates': duplicates,
            'limitations': ['Schema and provenance checks do not establish semantic label accuracy.',
                            'Template variants are controlled synthetic tests, not independent real-user data.',
                            'The v1 ResPlan source has upstream geometric near-duplicates across canonical splits; plan-ID disjointness does not remove them.'],
            'splits': summaries}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=Path, default=Path(__file__).resolve().parent / 'data-v2')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = audit(args.data)
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['passed'] else 1)
