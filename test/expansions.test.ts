import { describe, expect, it } from 'vitest';
import { areaTileKeys } from '../src/content/domain/city-grid';
import { expansionBlocks, offerStats, placedExpansions, rewardSources } from '../src/content/domain/expansions';
import type { ExpansionOffer } from '../src/content/model/city';
import { type EraId, eraId } from '../src/shared/ids';

// a 24 × 24 grid of 36 blocks
const grid = {
  width: 24,
  height: 24,
  blocks: Array.from({ length: 36 }, (_, i) => ({ x: (i % 6) * 4, y: Math.floor(i / 6) * 4 })),
};
// start area of 2 × 2 blocks and one expansion to its right
const areas = [
  { x: 0, y: 0, width: 8, length: 8 },
  { x: 8, y: 0, width: 4, length: 4 },
];

describe('placed expansions', () => {
  it('counts the unlocked blocks beyond the 16 of the start area', () => {
    const start = { x: 0, y: 0, width: 16, length: 16 };
    const tiles = (...areas: (typeof start)[]) => areaTileKeys(areas).size;
    expect(placedExpansions(tiles(start))).toBe(0);
    expect(
      placedExpansions(tiles(start, { x: 16, y: 0, width: 4, length: 4 }, { x: 16, y: 4, width: 4, length: 4 })),
    ).toBe(2);
  });
});

describe('expansion blocks', () => {
  it('finds the free blocks and splits them into adjacent and later ones', () => {
    const blocked = [{ x: 0, y: 8, width: 4, length: 4 }];
    const blocks = expansionBlocks(grid, areas, blocked);
    expect(blocks.unlocked).toBe(5);
    expect(blocks.blocked).toBe(1);
    // 36 − 5 unlocked − 1 blocked; sharing an edge with an unlocked block: right of the expansion, below it, and
    // below the start area (the block below on the left is blocked); the diagonal one at 8,8 is not adjacent
    expect(blocks.now.map((b) => `${b.x},${b.y}`).sort()).toEqual(['12,0', '4,8', '8,4']);
    expect(blocks.later).toHaveLength(30 - 3);
    expect(blocks.later).not.toContainEqual({ x: 0, y: 8, width: 4, length: 4 });
    expect(blocks.later).toContainEqual({ x: 8, y: 8, width: 4, length: 4 });
  });

  it('works without blocked areas', () => {
    expect(expansionBlocks(grid, areas, undefined).now).toHaveLength(4);
  });

  it('tests the top left tile of a block also for areas off the block lines', () => {
    // covers the top left tile of the block at 4,4 only
    const blocks = expansionBlocks(grid, [{ x: 2, y: 2, width: 3, length: 3 }], [{ x: 9, y: 1, width: 4, length: 4 }]);
    expect(blocks.unlocked).toBe(1);
    expect(blocks.blocked).toBe(1);
    expect(blocks.now.map((b) => `${b.x},${b.y}`).sort()).toEqual(['0,4', '4,0', '4,8', '8,4']);
  });
});

const eras = ['BronzeAge', 'IronAge', 'MarsAge'].map(eraId);
const eraIndex = (era: EraId) => {
  const i = eras.indexOf(era);
  return i < 0 ? undefined : i;
};
const coins = (money: number): ExpansionOffer => ({ kind: 'reward', cost: { money, premium: 1500 } });
const medals = (amount: number): ExpansionOffer => ({ kind: 'quantum', cost: { guild_raids_medals: amount } });
const diamonds = (era: string): ExpansionOffer => ({
  kind: 'diamonds',
  minEra: eraId(era),
  cost: { premium: 2000 },
});

describe('open expansions by kind', () => {
  const offers = [
    coins(45e6),
    coins(20e6),
    coins(30e6),
    medals(6e5),
    medals(9e5),
    diamonds('MarsAge'),
    diamonds('IronAge'),
  ];

  it('counts what the player can buy in a row, cheapest first, and names the price of the next one', () => {
    const have = { money: 60e6, guild_raids_medals: 5e5, premium: 1e6 };
    const stats = offerStats(offers, {
      era: eraId('IronAge'),
      eraIndex,
      amount: (id) => have[id as keyof typeof have] ?? 0,
    });
    // in the game's order; diamonds pay only for those of a reached era; reward expansions come as rewards only,
    // their coin price buys nothing (seen 2026-10-21: the game offers none of the open ones for sale)
    expect(stats).toEqual([
      { kind: 'diamonds', total: 2, buyable: 1, minEra: eraId('MarsAge') },
      { kind: 'reward', total: 3 },
      { kind: 'quantum', total: 2, buyable: 0, next: 6e5 },
    ]);
  });

  it('counts only offers of a reached era and leaves out kinds without offers', () => {
    const gated: ExpansionOffer[] = [
      { kind: 'quantum', minEra: eraId('MarsAge'), cost: { guild_raids_medals: 1 } },
      { kind: 'quantum', cost: { guild_raids_medals: 2 } },
    ];
    const stats = offerStats(gated, { era: eraId('BronzeAge'), eraIndex, amount: () => 100 });
    expect(stats).toEqual([{ kind: 'quantum', total: 2, buyable: 1, minEra: eraId('MarsAge') }]);
  });

  it('counts an offer of an unknown era as not reached', () => {
    const stats = offerStats([{ ...medals(1), minEra: eraId('FutureAge') }], {
      era: eraId('MarsAge'),
      eraIndex,
      amount: () => 100,
    });
    expect(stats).toEqual([{ kind: 'quantum', total: 1, buyable: 0, minEra: eraId('FutureAge') }]);
  });

  it('lists unknown kinds by their game type without a buy count', () => {
    expect(
      offerStats([{ kind: 'unknown', gameType: 'mystery', cost: {} }], {
        era: eraId('MarsAge'),
        eraIndex,
        amount: () => 0,
      }),
    ).toEqual([{ kind: 'mystery', total: 1 }]);
  });
});

describe('sources of reward expansions', () => {
  // technologies in the order of the tree, as the research metadata lists them
  const research = [
    { tech: 'wheel', name: 'Das Rad', amount: 1 },
    { tech: 'mars_rules', name: 'Mars-Vorschriften', amount: 2 },
    { tech: 'mars_more', name: 'Mars-Mehr', amount: 1 },
  ];

  it('counts the expansions of technologies not unlocked yet, names the first, and leaves the rest to the map', () => {
    expect(rewardSources(5, research, new Set(['root', 'wheel']))).toEqual({
      fromResearch: 3,
      nextTech: 'Mars-Vorschriften',
      fromMap: 2,
    });
  });

  it('names no next technology when all are unlocked', () => {
    expect(rewardSources(2, research, new Set(['wheel', 'mars_rules', 'mars_more']))).toEqual({
      fromResearch: 0,
      fromMap: 2,
    });
  });

  it('leaves out the map when nothing is left for it, or when research alone exceeds the open ones', () => {
    expect(rewardSources(4, research, new Set())).toEqual({ fromResearch: 4, nextTech: 'Das Rad' });
    expect(rewardSources(1, research, new Set())).toEqual({ fromResearch: 4, nextTech: 'Das Rad' });
  });

  it('knows nothing without the research metadata or the progress', () => {
    expect(rewardSources(5, undefined, new Set())).toBeUndefined();
    expect(rewardSources(5, research, undefined)).toBeUndefined();
  });
});
