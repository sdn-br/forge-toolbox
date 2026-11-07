import { describe, expect, it } from 'vitest';
import { learnSteps, levelCosts, seedEntries, seedJson, withShipped } from '../src/content/domain/gb-level-cost';

/** the levels 0 to 9 after the prestige update: linear from the base */
const listed = (base: number) => Array.from({ length: 10 }, (_, i) => base * (i + 1));
const seen = (entries: [number, number][]) => new Map(entries);

// the steps and costs below were checked against the game on 2026-11-05; the tests feed them as observations
describe('levelCosts', () => {
  it('takes a seen cost as exact, before anything else', () => {
    const cost = levelCosts(
      listed(84),
      seen([
        [137, 62495],
        [3, 1],
      ]),
    );
    expect(cost(137)).toEqual({ fp: 62495, estimate: false });
    expect(cost(3)).toEqual({ fp: 1, estimate: false });
  });

  it('takes the levels 0 to 9 from the definition, exact', () => {
    const cost = levelCosts(listed(84), seen([]));
    expect(cost(0)).toEqual({ fp: 84, estimate: false });
    expect(cost(9)).toEqual({ fp: 840, estimate: false });
  });

  it('knows nothing past level 9 without observations, nor for a negative or broken level', () => {
    const cost = levelCosts(listed(84), seen([]));
    expect(cost(10)).toBeUndefined();
    expect(cost(-1)).toBeUndefined();
    expect(cost(1.5)).toBeUndefined();
    expect(levelCosts([], seen([]))(5)).toBeUndefined();
  });

  it('Arche: one observation per segment chained from level 9, the 1.05 jump at 100, rounded at the end', () => {
    // steps 40, 65, 156, 1443
    const cost = levelCosts(
      listed(84),
      seen([
        [15, 1080],
        [50, 2755],
        [80, 5706],
        [120, 37964],
      ]),
    );
    expect(cost(10)).toEqual({ fp: 880, estimate: true });
    expect(cost(39)).toEqual({ fp: 2040, estimate: true });
    expect(cost(69)).toEqual({ fp: 3990, estimate: true });
    expect(cost(99)).toEqual({ fp: 8670, estimate: true });
    // 8670 × 1.05 = 9103.5
    expect(cost(100)).toEqual({ fp: 9104, estimate: true });
    // 9103.5 + 37 × 1443 = 62494.5
    expect(cost(137)).toEqual({ fp: 62495, estimate: true });
  });

  it('Zeusstatue: level 88 from steps 21, 34, 83', () => {
    const cost = levelCosts(
      listed(44),
      seen([
        [20, 671],
        [45, 1274],
        [70, 2173],
      ]),
    );
    expect(cost(88)).toEqual({ fp: 3667, estimate: true });
  });

  it('Galataturm: level 64 from two observations in a segment, no chain needed', () => {
    const cost = levelCosts(
      listed(47),
      seen([
        [41, 1534],
        [50, 1867],
      ]),
    );
    expect(cost(64)).toEqual({ fp: 2385, estimate: true });
  });

  it('Die blaue Galaxie: level 190 from steps 48, 77, 188, 1424', () => {
    const cost = levelCosts(
      listed(100),
      seen([
        [11, 1096],
        [41, 2594],
        [71, 5126],
        [101, 12334],
      ]),
    );
    // 10390 × 1.05 = 10909.5, + 90 × 1424 = 139069.5
    expect(cost(190)).toEqual({ fp: 139070, estimate: true });
  });

  it('learns a segment past 100 from two observations without the chain, sharing their rounding', () => {
    // Arche 137 and 120 seen, nothing below: the step is the difference, the levels between follow
    const cost = levelCosts(
      listed(84),
      seen([
        [120, 37964],
        [137, 62495],
      ]),
    );
    expect(cost(130)).toEqual({ fp: 52394, estimate: true });
    expect(cost(100)).toEqual({ fp: 9104, estimate: true });
    // no exact start, so nothing past the segment
    expect(cost(301)).toBeUndefined();
    expect(cost(99)).toBeUndefined();
  });

  it('chains past 300 only with the exact value, unrounded', () => {
    const cost = levelCosts(
      listed(84),
      seen([
        [15, 1080],
        [50, 2755],
        [80, 5706],
        [120, 37964],
        // 9103.5 + 200 × 1443 = 297703.5, + 10 × 2000
        [310, 317704],
      ]),
    );
    expect(cost(301)).toEqual({ fp: 299704, estimate: true });
    expect(cost(401)).toBeUndefined();
  });

  it('disables a segment whose observations do not fit one integer step, and chains nothing through it', () => {
    const cost = levelCosts(
      listed(84),
      seen([
        [15, 1080],
        [50, 2755],
        [55, 3081],
        [80, 5706],
      ]),
    );
    expect(cost(15)).toEqual({ fp: 1080, estimate: false });
    // segment 40 to 69 contradicts: 2755 + 5 × 65 = 3080
    expect(cost(45)).toBeUndefined();
    expect(cost(55)).toEqual({ fp: 3081, estimate: false });
    // nothing chained into 70 to 99, and one observation alone gives no step
    expect(cost(75)).toBeUndefined();
  });

  it('disables a segment whose observation does not fit an integer step from the chained start', () => {
    // 840 + 6 × 40 = 1080, one more gives 241 / 6
    const cost = levelCosts(listed(84), seen([[15, 1081]]));
    expect(cost(14)).toBeUndefined();
  });

  it('disables the segment from 100 when level 100 breaks the 1.05 rule (another curve)', () => {
    const cost = levelCosts(
      listed(84),
      seen([
        [15, 1080],
        [50, 2755],
        [80, 5706],
        [100, 9500],
        [120, 38360],
      ]),
    );
    expect(cost(99)).toEqual({ fp: 8670, estimate: true });
    expect(cost(110)).toBeUndefined();
  });
});

describe('learnSteps', () => {
  it('gives the step of each segment, undefined where unknown, and marks the contradicting ones', () => {
    const steps = learnSteps(
      listed(84),
      seen([
        [15, 1080],
        [50, 2755],
        [55, 3081],
        [120, 37964],
        [137, 62495],
      ]),
    );
    expect(steps.map((s) => [s.first, s.step, s.disabled])).toEqual([
      [10, 40, false],
      [40, undefined, true],
      [70, undefined, false],
      [100, 1443, false],
      [301, undefined, false],
      [401, undefined, false],
    ]);
  });
});

// Arche: steps 40 from 10, 65 from 40; level 39 costs 2040
describe('withShipped', () => {
  const costs = (own: [number, number][], shipped: [number, number][]) =>
    levelCosts(listed(84), withShipped(listed(84), seen(own), seen(shipped)));

  it('learns from shipped costs alone as if seen', () => {
    const cost = costs(
      [],
      [
        [15, 1080],
        [50, 2755],
      ],
    );
    expect(cost(15)).toEqual({ fp: 1080, estimate: false });
    expect(cost(10)).toEqual({ fp: 880, estimate: true });
    expect(cost(60)).toEqual({ fp: 3405, estimate: true });
  });

  it('joins own costs that agree with the shipped ones', () => {
    const merged = withShipped(listed(84), seen([[20, 1280]]), seen([[15, 1080]]));
    expect([...merged].sort((a, b) => a[0] - b[0])).toEqual([
      [15, 1080],
      [20, 1280],
    ]);
  });

  it('takes an own cost over the shipped one of the same level', () => {
    const cost = costs([[15, 1080]], [[15, 1000]]);
    expect(cost(15)).toEqual({ fp: 1080, estimate: false });
    expect(cost(10)).toEqual({ fp: 880, estimate: true });
  });

  it('drops the shipped costs of a segment an own cost contradicts, the own ones compute it', () => {
    // the game raised the step from 40 on to 70: 2040 + 6 × 70 = 2460 does not fit 2170 at 41 and 2755 at 50
    const shipped: [number, number][] = [
      [15, 1080],
      [41, 2170],
      [50, 2755],
    ];
    const merged = withShipped(listed(84), seen([[45, 2460]]), seen(shipped));
    expect(merged.has(41)).toBe(false);
    expect(merged.has(50)).toBe(false);
    const cost = costs([[45, 2460]], shipped);
    // the shipped segment before stays and chains to the own one
    expect(cost(15)).toEqual({ fp: 1080, estimate: false });
    expect(cost(50)).toEqual({ fp: 2810, estimate: true });
    expect(cost(41)).toEqual({ fp: 2180, estimate: true });
  });

  it('keeps a segment disabled whose shipped costs contradict each other', () => {
    const cost = costs(
      [[80, 5706]],
      [
        [15, 1080],
        [50, 2755],
        [55, 3081],
      ],
    );
    expect(cost(45)).toBeUndefined();
    expect(cost(55)).toEqual({ fp: 3081, estimate: false });
    expect(cost(75)).toBeUndefined();
  });
});

describe('seedJson', () => {
  it('writes every level, one line per type, types sorted, levels ascending, and no type without costs', () => {
    expect(seedJson(new Map())).toBe('{}\n');
    const json = seedJson(
      new Map([
        [
          'b',
          seen([
            [50, 2755],
            [15, 1080],
          ]),
        ],
        ['c', seen([])],
        [
          'a',
          seen([
            [120, 37964],
            [3, 336],
            [9, 840],
            [10, 880],
          ]),
        ],
      ]),
    );
    expect(json).toBe('{\n  "a": {"3":336,"9":840,"10":880,"120":37964},\n  "b": {"15":1080,"50":2755}\n}\n');
    expect(seedEntries(JSON.parse(json))).toEqual([
      { type: 'a', level: 3, fp: 336 },
      { type: 'a', level: 9, fp: 840 },
      { type: 'a', level: 10, fp: 880 },
      { type: 'a', level: 120, fp: 37964 },
      { type: 'b', level: 15, fp: 1080 },
      { type: 'b', level: 50, fp: 2755 },
    ]);
  });
});
