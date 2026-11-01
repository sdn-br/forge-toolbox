import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import type { CityAssessment } from '../src/content/domain/assess-city';
import { sabotageViewModel } from '../src/content/features/sabotage/view-model';
import type { VisitedRecord } from '../src/content/features/sabotage/visited-record';
import type { BuildingDef } from '../src/content/model/catalog';
import { CatalogStore } from '../src/content/stores/catalog';
import type { VisitedCity } from '../src/content/stores/cities';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, IncomingAttack, Plunder } from '../src/shared/model';
import { playerLookups } from './helpers/player-lookups';

const city: VisitedCity = {
  world: worldId('de20'),
  owner: playerId(1001),
  era: eraId('ColonialAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(),
  visit: { neighbor: true, friend: false, guildMember: false },
};

const assessment: CityAssessment = {
  army: { attacker: { attack: 100, defense: 90 }, defender: { attack: 376, defense: 402 } },
  plunderRepel: 0,
  plunderable: [],
  missingDefs: [],
  boostTotals: {},
};

const lookups = playerLookups();
const now = new Date(2026, 9, 19, 15, 0).getTime();
const battle: Battle = {
  world: city.world,
  battleId: 1,
  at: new Date(2026, 9, 19, 13, 49).getTime(),
  opponent: city.owner,
  result: 'won',
  auto: true,
  rounds: 2,
  era: city.era,
  attacker: { bonuses: { attack_boost: 233, military_boost: 135 }, units: [] },
  defender: {
    bonuses: { defender_attack_boost: 353, defense_boost: 390, fierce_resistance: 32.5, advanced_tactics: 20.5 },
    units: [],
  },
};

const vmOf = (showArmy: boolean, last?: Battle) =>
  sabotageViewModel({
    city,
    player: undefined,
    lookups,
    assessment,
    catalog: new CatalogStore(createBus()),
    showArmy,
    now,
    record: { lastBattle: last },
  });

describe('sabotage view model', () => {
  it('shows the measured defending army with the time of the battle', () => {
    expect(vmOf(true, battle).measured).toEqual({ defender: { attack: 406, defense: 443 }, when: 'heute 13:49' });
    expect(vmOf(true, battle).army).toEqual(assessment.army);
  });

  it('has no measured values without a battle or when army values are hidden', () => {
    expect(vmOf(true).measured).toBeUndefined();
    expect(vmOf(false, battle).measured).toBeUndefined();
  });

  it('lists the plunderable buildings with named resources', () => {
    const vm = sabotageViewModel({
      city,
      player: undefined,
      lookups,
      assessment: { ...assessment, plunderable: [{ building: 1, name: 'Haus', resources: { money: 20 } }] },
      catalog: new CatalogStore(createBus()),
      showArmy: false,
      now,
      record: {},
    });
    expect(vm.plunderable).toEqual([
      { building: 1, name: 'Haus', important: false, items: [{ label: 'Münzen', amount: 20 }] },
    ]);
  });

  it('lists important plunders first, by Forge points, then other loot, then coins and supplies, then by name', () => {
    const p = (building: number, name: string, resources: Record<string, number>) => ({ building, name, resources });
    const vm = sabotageViewModel({
      city,
      player: undefined,
      lookups,
      assessment: {
        ...assessment,
        plunderable: [
          p(1, 'Münzhaus', { money: 20_000 }),
          p(2, 'Güterlager', { marble: 500 }),
          p(3, 'Kleines FP-Haus', { strategy_points: 4 }),
          p(4, 'Vorratshof', { supplies: 300 }),
          p(5, 'Großes FP-Haus', { strategy_points: 10, money: 5 }),
          p(6, 'Gildenhalle', { guild_power: 120 }),
          p(7, 'Andere Münzen', { money: 300 }),
          p(8, 'Aaa Münzen', { money: 300 }),
          p(9, 'FP und Güter', { strategy_points: 4, marble: 5 }),
        ],
      },
      catalog: new CatalogStore(createBus()),
      showArmy: false,
      now,
      record: {},
    });
    expect(vm.plunderable.map((i) => [i.name, i.important])).toEqual([
      ['Großes FP-Haus', true],
      ['FP und Güter', true],
      ['Kleines FP-Haus', true],
      ['Güterlager', true],
      ['Gildenhalle', true],
      ['Münzhaus', false],
      ['Aaa Münzen', false],
      ['Andere Münzen', false],
      ['Vorratshof', false],
    ]);
  });

  it('shows the last own plunder here with building, loot and Double Loot, and the totals', () => {
    const catalog = new CatalogStore(createBus());
    catalog.setResourceNames({ marble: 'Marmor' });
    catalog.add({ id: buildingDefId('R_IronAge_Residential2'), name: 'Strohdachhaus' } as BuildingDef);
    const last: Plunder = {
      world: city.world,
      at: new Date(2026, 9, 19, 14, 5).getTime(),
      opponent: city.owner,
      outcome: 'plundered',
      entityId: 350,
      cityEntityId: buildingDefId('R_IronAge_Residential2'),
      resources: { marble: 30, strategy_points: 2 },
      doubleLoot: true,
    };
    const vm = (plunders?: VisitedRecord['plunders']) =>
      sabotageViewModel({
        city,
        player: undefined,
        lookups,
        assessment,
        catalog,
        showArmy: false,
        now,
        record: { plunders },
      }).plundered;
    expect(vm({ last, totals: { count: 3, repelled: 0, fp: 9 } })).toEqual({
      last: { text: 'Zuletzt heute 14:05, Strohdachhaus: 30 Marmor, 2 Forge-Punkte', doubleLoot: true },
      totals: '3 Plünderungen, 9 FP',
    });
    expect(vm({ totals: { count: 0, repelled: 0, fp: 0 } })).toEqual({
      last: undefined,
      totals: '0 Plünderungen, 0 FP',
    });
    expect(vm()).toBeUndefined();
  });

  it('tells when the last own plunder here was repelled and counts repelled ones apart', () => {
    const last: Plunder = {
      world: city.world,
      at: new Date(2026, 9, 19, 14, 5).getTime(),
      opponent: city.owner,
      outcome: 'repelled',
      resources: {},
      doubleLoot: false,
    };
    const vm = sabotageViewModel({
      city,
      player: undefined,
      lookups,
      assessment,
      catalog: new CatalogStore(createBus()),
      showArmy: false,
      now,
      record: { plunders: { last, totals: { count: 5, repelled: 2, fp: 120 } } },
    });
    expect(vm.plundered).toEqual({
      last: { text: 'Zuletzt heute 14:05: abgewehrt', doubleLoot: false },
      totals: '5 Plünderungen, 2 abgewehrt, 120 FP',
    });
    const at = { ...last, entityId: 904, cityEntityId: buildingDefId('R_MultiAge_PatrickBonusSet20b') };
    const named = sabotageViewModel({
      city,
      player: undefined,
      lookups,
      assessment,
      catalog: new CatalogStore(createBus()),
      showArmy: false,
      now,
      record: { plunders: { last: at, totals: { count: 0, repelled: 1, fp: 0 } } },
    });
    expect(named.plundered?.last).toEqual({
      text: 'Zuletzt heute 14:05, R_MultiAge_PatrickBonusSet20b: abgewehrt',
      doubleLoot: false,
    });
  });

  it('tells when this player last attacked the own city, with the totals of their attacks', () => {
    const catalog = new CatalogStore(createBus());
    catalog.add({ id: buildingDefId('R_IronAge_Residential2'), name: 'Strohdachhaus' } as BuildingDef);
    const last: IncomingAttack = {
      world: city.world,
      kind: 'battle',
      key: 1,
      at: new Date(2026, 9, 19, 14, 5).getTime(),
      attacker: city.owner,
      defense: 'broken',
    };
    const vm = (incoming?: VisitedRecord['incoming']) =>
      sabotageViewModel({
        city,
        player: undefined,
        lookups,
        assessment,
        catalog,
        showArmy: false,
        now,
        record: { incoming },
      }).attackedMe;
    expect(vm({ last, totals: { battles: 2, held: 1, plunders: 1 } })).toEqual({
      when: 'heute 14:05',
      what: 'Kampf: durchbrochen',
      totals: '2 Angriffe, 1 abgewehrt, 1 Plünderung',
    });
    const plunder = {
      ...last,
      kind: 'plunder' as const,
      defense: undefined,
      cityEntityId: buildingDefId('R_IronAge_Residential2'),
    };
    expect(vm({ last: plunder, totals: { battles: 0, held: 0, plunders: 1 } })?.what).toBe('Plünderung: Strohdachhaus');
    expect(vm({ totals: { battles: 0, held: 0, plunders: 0 } })).toBeUndefined();
    expect(vm()).toBeUndefined();
  });
});

describe('sabotage player head', () => {
  const head = (change: Parameters<typeof playerLookups>[0]) =>
    sabotageViewModel({
      city,
      player: undefined,
      lookups: playerLookups(change),
      assessment,
      catalog: new CatalogStore(createBus()),
      showArmy: false,
      now,
      record: {},
    }).player;

  it('names the player with the foestats page, the guild, star and eye', () => {
    expect(
      head({
        playerName: () => 'Anna',
        playerGuild: () => ({ name: 'Gilde', url: 'https://foestats.com/de/de20/guilds/7' }),
        playerMarked: () => true,
        ownerIgnored: () => false,
      }),
    ).toEqual({
      owner: 'Anna',
      ownerUrl: 'https://foestats.com/de/de20/players/1001',
      ownerGuild: { name: 'Gilde', url: 'https://foestats.com/de/de20/guilds/7' },
      ownerMarked: true,
      ownerIgnored: false,
      era: 'ColonialAge',
    });
  });

  it('has no star, eye or guild for a player the store does not know', () => {
    expect(head({})).toEqual({ owner: '', ownerUrl: 'https://foestats.com/de/de20/players/1001', era: 'ColonialAge' });
  });
});
