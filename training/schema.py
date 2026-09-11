"""Strict extraction contract shared by corpus audits and generated-answer scoring."""
import json

PROJECT_TYPES = {'house', 'resort', 'apartment', 'unsupported'}
KINDS = set('living master bedroom bathroom kitchen dining pooja office theatre parking entrance stairs lift garden jacuzzi seating balcony terrace utility store cottage pool deck reception restaurant bar common service road path recreation'.split())
THRESHOLDS = {'json': 1.0, 'schema': 1.0, 'projectType': .95, 'intent': .95,
              'features': .90, 'unsupportedFeatures': .95, 'evidence': 1.0, 'exact': .90}


def request_text(row):
    return row['messages'][1]['content'].split('\nRequest: ', 1)[1]


def validate(obj, request, *, extended=True):
    errors = []
    if not isinstance(obj, dict):
        return ['answer must be an object']
    expected = {'projectType', 'intent', 'features'} | ({'unsupportedFeatures'} if extended else set())
    if set(obj) != expected:
        errors.append('answer keys do not match the extraction contract')
    if obj.get('projectType') not in PROJECT_TYPES:
        errors.append('unknown projectType')
    if obj.get('intent') not in ('new', 'edit'):
        errors.append('unknown intent')
    features = obj.get('features')
    if not isinstance(features, list) or len(features) > 60:
        return errors + ['features must be an array of at most 60 items']
    seen = set()
    for feature in features:
        if not isinstance(feature, dict) or set(feature) != {'kind', 'count', 'evidence', 'excluded'}:
            errors.append('invalid feature shape')
            continue
        kind = feature['kind']
        if not isinstance(kind, str) or kind not in KINDS:
            errors.append('unknown feature kind')
        elif kind in seen:
            errors.append('duplicate feature kind')
        else:
            seen.add(kind)
        count = feature['count']
        if count is not None and (type(count) is not int or count <= 0 or count > 10000):
            errors.append('count must be a positive integer up to 10000 or null')
        if type(feature['excluded']) is not bool:
            errors.append('excluded must be boolean')
        if not valid_evidence(feature.get('evidence'), request):
            errors.append('feature evidence is not a nonempty exact request substring')
    if extended:
        unsupported = obj.get('unsupportedFeatures')
        if not isinstance(unsupported, list) or len(unsupported) > 60:
            errors.append('unsupportedFeatures must be an array of at most 60 items')
        else:
            evidence_seen = set()
            for feature in unsupported:
                if not isinstance(feature, dict) or set(feature) != {'evidence'} or not valid_evidence(feature.get('evidence'), request):
                    errors.append('invalid unsupported feature evidence')
                elif feature['evidence'] in evidence_seen:
                    errors.append('duplicate unsupported feature evidence')
                else:
                    evidence_seen.add(feature['evidence'])
    return errors


def valid_evidence(value, request):
    return isinstance(value, str) and bool(value.strip()) and value in request


def signature(obj):
    return sorted((f['kind'], f['count'], f['excluded']) for f in obj['features'])


def score(answer, target, request, *, extended=True):
    checks = dict.fromkeys(THRESHOLDS, False)
    try:
        obj = json.loads(answer)
        checks['json'] = True
        checks['schema'] = not validate(obj, request, extended=extended)
        if not checks['schema']:
            return checks
        checks['projectType'] = obj['projectType'] == target['projectType']
        checks['intent'] = obj['intent'] == target['intent']
        checks['features'] = signature(obj) == signature(target)
        # Quoted spans can vary while preserving semantic requirements. Unsupported
        # spans have no canonical kind, so score their explicitly labelled quotes.
        checks['unsupportedFeatures'] = not extended or sorted(f['evidence'] for f in obj['unsupportedFeatures']) == sorted(f['evidence'] for f in target['unsupportedFeatures'])
        checks['evidence'] = True
        checks['exact'] = all(v for k, v in checks.items() if k != 'exact')
    except (ValueError, KeyError, TypeError):
        pass
    return checks
