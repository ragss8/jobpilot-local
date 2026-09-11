"""Deterministic synthetic extraction curriculum; never reads v1 held-out answers.

Versioned, split-specific wording is declared before training. These are authored
examples, not observations of real user conversations or architectural rules.
"""
import hashlib
import json
import random
from pathlib import Path

from schema import validate

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data-v2'
SYSTEM = (ROOT / 'system.txt').read_text()
SEED = 20260910
WORDS = {
    'living': ('living room', 'lounge', 'living area'),
    'master': ('master bedroom', 'primary bedroom', 'main bedroom'),
    'bedroom': ('bedroom', 'bedroom', 'bedroom'),
    'bathroom': ('bathroom', 'washroom', 'bathroom'),
    'kitchen': ('kitchen', 'kitchen', 'kitchen'),
    'dining': ('dining room', 'dining area', 'dining space'),
    'pooja': ('pooja room', 'prayer room', 'puja room'),
    'office': ('home office', 'study room', 'office room'),
    'theatre': ('home theatre', 'home cinema', 'media room'),
    'parking': ('parking space', 'car parking space', 'parking bay'),
    'entrance': ('entrance', 'entry', 'entry point'),
    'stairs': ('staircase', 'stairway', 'stair'),
    'lift': ('lift', 'elevator', 'lift'),
    'garden': ('garden', 'garden', 'garden'),
    'jacuzzi': ('jacuzzi', 'hot tub', 'spa tub'),
    'seating': ('seating area', 'seating area', 'seating zone'),
    'balcony': ('balcony', 'balcony', 'balcony'),
    'terrace': ('terrace', 'terrace', 'terrace'),
    'utility': ('utility room', 'laundry room', 'utility area'),
    'store': ('store room', 'storage room', 'storeroom'),
    'cottage': ('cottage', 'guest cottage', 'cottage'),
    'pool': ('swimming pool', 'pool', 'swimming pool'),
    'deck': ('deck', 'pool deck', 'deck'),
    'reception': ('reception', 'reception area', 'reception desk'),
    'restaurant': ('restaurant', 'restaurant', 'restaurant'),
    'bar': ('bar', 'bar', 'bar'),
    'common': ('common area', 'shared area', 'communal space'),
    'service': ('service area', 'service zone', 'service space'),
    'road': ('access road', 'internal road', 'road'),
    'path': ('walking path', 'footpath', 'pedestrian path'),
    'recreation': ('recreation area', 'play area', 'recreation space'),
}
KINDS = ('house', 'resort', 'apartment')
LABELS = ('house', 'resort', 'apartment building')
NEW = ('Design a new {label} with {features}.',
       'Starting a separate {label}: please provide {features}.',
       'For a fresh {label} project, the brief calls for {features}.')
EDIT = ('Add {features} to the current plan.',
        'Keep this project and include {features}.',
        'Revise our existing design so it contains {features}.')
REMOVE = ('Remove the {features} from this design.',
          'Please omit the {features} in our current plan.',
          'We no longer want the {features} in the existing project.')
COUNT_WORDS = {1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five'}


def plural(word, n):
    if n == 1:
        return word
    if word.endswith('balcony'):
        return word[:-1] + 'ies'
    if word.endswith(('ss', 'ch', 'sh')):
        return word + 'es'
    return word + 's'


def generate():
    rows = {s: [] for s in ('train', 'valid', 'test')}
    for index, split in enumerate(rows):
        rng = random.Random(SEED + index)

        def add(text, kind, active, features=(), *, intent='new', unsupported=(), category):
            answer = {'projectType': kind, 'intent': intent,
                      'features': [{'kind': k, 'count': n, 'evidence': e, 'excluded': x} for k, n, e, x in features],
                      'unsupportedFeatures': [{'evidence': e} for e in unsupported]}
            errors = validate(answer, text)
            if errors:
                raise ValueError((text, errors))
            rows[split].append({'messages': [{'role': 'system', 'content': SYSTEM},
                                            {'role': 'user', 'content': f'Active project: {active or "none"}\nRequest: {text}'},
                                            {'role': 'assistant', 'content': json.dumps(answer, separators=(',', ':'))}],
                                'source': 'authored-synthetic-v2', 'category': category,
                                'templateFamily': f'{split}:{category}'})

        repeats = 3 if split == 'train' else 1
        for repeat in range(repeats):
            for pos, (feature_kind, synonyms) in enumerate(WORDS.items()):
                project_index = (pos + repeat + index) % len(KINDS)
                kind, label = KINDS[project_index], LABELS[project_index]
                active = KINDS[(project_index + 1) % len(KINDS)]
                count = rng.randint(1, 5)
                word = synonyms[index]
                numeral = COUNT_WORDS[count] if (pos + repeat) % 2 else str(count)
                phrase = f'{numeral} {plural(word, count)}'
                add(NEW[index].format(label=label, features=phrase), kind, active,
                    [(feature_kind, count, phrase, False)], category='new-counts')
                add(EDIT[index].format(features=phrase), kind, kind,
                    [(feature_kind, count, phrase, False)], intent='edit', category='edit-counts')
                add(REMOVE[index].format(features=word), kind, kind,
                    [(feature_kind, None, word, True)], intent='edit', category='negation')

        for i in range(48 if split == 'train' else 12):
            pi = i % 3
            selected = rng.sample(list(WORDS), rng.randint(2, 4))
            features = []
            for k in selected:
                n = rng.randint(1, 5)
                phrase = f'{n} {plural(WORDS[k][index], n)}'
                features.append((k, n, phrase, False))
            text = NEW[index].format(label=LABELS[pi], features=', '.join(f[2] for f in features))
            add(text, KINDS[pi], None, features, category='multiple-features')

        for pi, kind in enumerate(KINDS):
            for feature_kind in ('pool', 'bedroom', 'garden', 'kitchen'):
                word = WORDS[feature_kind][index]
                text = NEW[index].format(label=LABELS[pi], features=f'a {word}')
                add(text, kind, KINDS[(pi + 1) % 3], [(feature_kind, None, word, False)], category='unspecified-count')
            # These explicitly delimit old requirements, which must be discarded.
            scoped = (
                f'The old house had 4 bedrooms and a jacuzzi. Start a new {LABELS[pi]} with a garden.',
                f'Previously we discussed a resort with 8 cottages. Separate project: a {LABELS[pi]} with a garden.',
                f'Ignore the earlier apartment with 6 bathrooms. This fresh {LABELS[pi]} needs a garden.',
            )[index]
            add(scoped, kind, 'house', [('garden', None, 'garden', False)], category='project-isolation')
            resize = ('Change the current plot to 70 x 90 feet.',
                      'Keep the project; resize its plot to 80 x 110 ft.',
                      'Use a 60 by 95 foot site for this existing design.')[index]
            add(resize, kind, kind, intent='edit', category='dimension-only-edit')
            for unknown in (('helipad', 'observatory', 'bowling alley', 'sauna') if split == 'train'
                            else ('climbing wall', 'tennis court') if split == 'valid'
                            else ('skating rink', 'aquarium')):
                text = NEW[index].format(label=LABELS[pi], features=f'a kitchen and a {unknown}')
                add(text, kind, None, [('kitchen', None, 'kitchen', False)], unsupported=[unknown], category='unsupported-amenity')
                text = (f'Add a {unknown} to the current plan.' if split == 'train'
                        else f'Please include a {unknown} in this design.' if split == 'valid'
                        else f'The existing project also needs a {unknown}.')
                add(text, kind, kind, intent='edit', unsupported=[unknown], category='unsupported-amenity-edit')
            neg_unknown = ('Design a new {label} with a garden, no helipad.',
                           'Starting a separate {label}: a garden, without a climbing wall.',
                           'For a fresh {label} project provide a garden; exclude an aquarium.')[index].format(label=LABELS[pi])
            add(neg_unknown, kind, None, [('garden', None, 'garden', False)], category='negated-unsupported')
            for addition in ('garden', 'kitchen'):
                mixed = ('Remove the pool and add a {feature}.',
                         'In this plan, omit the pool; include a {feature}.',
                         'Revise our design: no pool, but provide a {feature}.')[index].format(feature=addition)
                add(mixed, kind, kind, [('pool', None, 'pool', True), (addition, None, addition, False)], intent='edit', category='mixed-edit')

        for unsupported in (('hospital', 'school', 'airport', 'warehouse', 'office building', 'shopping mall') if split == 'train'
                            else ('university', 'factory', 'stadium') if split == 'valid'
                            else ('museum', 'railway station', 'courthouse')):
            add(NEW[index].format(label=unsupported, features='a kitchen'), 'unsupported', 'house',
                [('kitchen', None, 'kitchen', False)], category='unsupported-building')

        rng.shuffle(rows[split])

    DATA.mkdir(exist_ok=True)
    manifest = {'version': 2, 'seed': SEED, 'source': 'authored-synthetic-v2',
                'description': 'Controlled extraction curriculum only; split-specific wording and unsupported-amenity/building vocabularies. Not independent real-world evaluation.',
                'system_sha256': hashlib.sha256(SYSTEM.encode()).hexdigest(),
                'generator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'splits': {}}
    for split, records in rows.items():
        path = DATA / f'{split}.jsonl'
        path.write_text(''.join(json.dumps(record) + '\n' for record in records))
        manifest['splits'][split] = {'rows': len(records), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    (DATA / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    generate()
