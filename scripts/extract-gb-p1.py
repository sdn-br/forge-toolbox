# Extracts the first place rewards of great buildings (game data) from the data table of the old FoE Toolbox into
# src/content/data/gb-p1.json. Only the numbers are taken, none of its code.
# Usage: python3 -I scripts/extract-gb-p1.py <foe-toolbox>/js/web/greatbuildings/js/greatbuildings.js src/content/data/gb-p1.json
# then: npx biome format --write src/content/data/gb-p1.json
#
# Source: the object `GreatBuildings.Rewards`, key = era number (index in the game's era list + 1, 0 = AllAge), value =
# P1 without the Arc bonus per 0-based level. A comment "formula estimates: levels …" above a row lists levels that
# are no game data but an estimate of that toolbox; those become null here (trailing ones are dropped), the forge
# toolbox estimates them itself.

import json, re, sys

# the game's eras in order (the old toolbox's Technologies.EraList); era number = index + 1
ERAS = ['StoneAge', 'BronzeAge', 'IronAge', 'EarlyMiddleAge', 'HighMiddleAge', 'LateMiddleAge', 'ColonialAge',
        'IndustrialAge', 'ProgressiveEra', 'ModernEra', 'PostModernEra', 'ContemporaryEra', 'TomorrowEra', 'FutureEra',
        'ArcticFuture', 'OceanicFuture', 'VirtualFuture', 'SpaceAgeMars', 'SpaceAgeAsteroidBelt', 'SpaceAgeVenus',
        'SpaceAgeJupiterMoon', 'SpaceAgeTitan', 'SpaceAgeSpaceHub', 'StellarAgeDiscovery']

def levels(spec):
    out = set()
    for part in spec.split(','):
        part = part.strip()
        if '-' in part:
            a, b = part.split('-')
            out |= set(range(int(a), int(b) + 1))
        elif part:
            out.add(int(part))
    return out

def main(src, out):
    text = open(src, encoding='utf-8').read()
    start = text.index('Rewards: {')
    block = text[start:text.index('\n    },', start)]
    p1, estimated = {}, set()
    for line in block.split('\n'):
        m = re.match(r'\s*// formula estimates: levels (.*)', line)
        if m:
            estimated = levels(m.group(1))
            continue
        m = re.match(r'\s*(\d+): (\[[^\]]*\])', line)
        if not m:
            continue
        number, values = int(m.group(1)), json.loads(m.group(2))
        row = [None if i in estimated else v for i, v in enumerate(values)]
        while row and row[-1] is None:
            row.pop()
        p1['AllAge' if number == 0 else ERAS[number - 1]] = row
        estimated = set()
    data = {
        'note': 'First place reward (Forge points, without the Arc bonus) of a great building per era of the building '
                'and 0-based level, the level the construction starts from. Game data from the table of the old FoE '
                'Toolbox (GreatBuildings.Rewards, extract by scripts/extract-gb-p1.py); null where it had only an '
                'estimate. `eras` is the game order, era number = index + 1. AllAge equals HighMiddleAge.',
        'eras': ERAS,
        'p1': p1,
    }
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
