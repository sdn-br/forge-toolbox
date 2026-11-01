// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mapToolbox1, mapToolbox2 } from '../src/backup/legacy/mapper';
import type { LegacyDump } from '../src/backup/legacy/types';
import { buildingDefId, eraId, guildId, playerId, worldId } from '../src/shared/ids';
import { isFought } from '../src/shared/model';
import v1 from './fixtures/legacy-toolbox1.json';
import v2 from './fixtures/legacy-toolbox2.json';

const de20 = worldId('de20');
const profile = { world: de20, player: playerId(1001) };
const NOW = Date.UTC(2026, 9, 27, 12);
const at = (iso: string) => Date.parse(iso);

const dump2: LegacyDump = {
  attacks: v2.neighborhoodAttacks,
  players: v2.players,
  events: v2.Events,
  groups: v2.groups,
  items: v2.items,
};
const dump1: LegacyDump = { attacks: v1.neighborhoodAttacks, players: v1.players, events: v1.Events };

describe('mapToolbox2', () => {
  const { tables, unmapped } = mapToolbox2(dump2, profile, NOW);

  it('maps battles of types 2 to 4 with both armies, without arena battles', () => {
    expect(tables.battles.map((b) => [b.opponent, b.result, b.at])).toEqual([
      [2001, 'won', at('2026-10-18T08:20:10.000Z')],
      [2002, 'lost', at('2026-10-19T09:58:00.000Z')],
      [2003, 'surrendered', at('2026-10-20T12:00:00.000Z')],
    ]);
    expect(tables.battles[0]).toEqual({
      world: de20,
      // no battle id in the old data: negative, so it never meets a game battle id
      battleId: -at('2026-10-18T08:20:10.000Z'),
      at: at('2026-10-18T08:20:10.000Z'),
      opponent: playerId(2001),
      result: 'won',
      auto: true,
      rounds: 1,
      era: eraId('ColonialAge'),
      attacker: {
        bonuses: { attack_boost: 368, attacker_defense_boost: 269 },
        units: [
          { unitTypeId: 'grenadier', startHp: 10, endHp: 10 },
          { unitTypeId: 'grenadier', startHp: 10, endHp: 4 },
        ],
      },
      defender: {
        bonuses: { defender_attack_boost: 4, defense_boost: 12 },
        units: [{ unitTypeId: 'javeliner', startHp: 10, endHp: 0 }],
      },
    });
  });

  it('maps plunders of type 1 and repelled ones of type 6, without shields', () => {
    expect(tables.plunders).toEqual([
      {
        world: de20,
        at: at('2026-10-18T08:31:54.508Z'),
        opponent: playerId(2001),
        outcome: 'plundered',
        entityId: 962,
        cityEntityId: buildingDefId('G_HighMiddleAge_GlassblowingWorkshop'),
        resources: { glass: 10 },
        doubleLoot: false,
      },
      {
        world: de20,
        at: at('2026-10-19T10:00:00.000Z'),
        opponent: playerId(2002),
        outcome: 'plundered',
        entityId: 17,
        cityEntityId: buildingDefId('R_MultiAge_SummerBonus18'),
        resources: { strategy_points: 8, money: 400 },
        doubleLoot: true,
      },
      {
        world: de20,
        at: at('2026-10-21T07:15:00.000Z'),
        opponent: playerId(2003),
        outcome: 'repelled',
        entityId: 401,
        cityEntityId: buildingDefId('R_MultiAge_HeroBonus22pass'),
        resources: {},
        doubleLoot: false,
      },
    ]);
  });

  it('maps battles and plunders on the own city from the events, the battle without its outcome', () => {
    expect(tables.incoming).toEqual([
      { world: de20, kind: 'battle', key: -1430000002, at: at('2026-10-23T07:00:00.000Z'), attacker: playerId(2006) },
      {
        world: de20,
        kind: 'plunder',
        key: 1430000003,
        at: at('2026-10-23T07:01:00.000Z'),
        attacker: playerId(2006),
        cityEntityId: buildingDefId('R_MultiAge_SummerBonus18'),
      },
    ]);
  });

  it('maps note groups and pages, the player group to the player pages', () => {
    expect(tables.noteGroups).toEqual([
      { world: de20, id: 'legacy:1', name: 'Allgemein', sort: 1 },
      { world: de20, id: 'legacy:3', name: 'Plan', sort: 0 },
    ]);
    const page = (id: string, group: string, title: string, text: string, sort: number, player?: number) => ({
      world: de20,
      id,
      group,
      title,
      text,
      sort,
      updatedAt: NOW,
      ...(player !== undefined && { player: playerId(player) }),
    });
    expect(tables.notePages).toEqual([
      page('legacy:1', 'legacy:1', 'Merkzettel', 'Erst die **Werkstatt** leveln\n\n- Glas\n- Seide', 1),
      page('legacy:2', 'legacy:1', 'Alt', '**Alter Titel**\nText', 2),
      page('player:2001', 'players', 'Alpha', 'baut gern *nachts*', 1, 2001),
      page('player:2007', 'players', 'Golf', 'nur in den Notizen', 2, 2007),
      page('legacy:8', 'legacy:3', 'Ziele', '## Woche\n\nPlan', 0),
    ]);
  });

  it('keeps the players the rows refer to, from the players table, the events or the note', () => {
    expect(tables.players.map((p) => p.id).sort()).toEqual([2001, 2002, 2003, 2006, 2007]);
    const byId = (id: number) => tables.players.find((p) => p.id === id);
    expect(byId(2001)).toEqual({
      world: de20,
      id: playerId(2001),
      name: 'Alpha',
      avatar: 'portrait_101',
      cityName: '',
      era: eraId('ColonialAge'),
      score: 120000,
      rank: 0,
      active: true,
      guild: { id: guildId(77), name: 'Erfundene Gilde' },
      relations: { neighbor: false, guildMember: false, friend: false },
      firstSeenAt: at('2026-10-25T10:00:00.000Z'),
      seenAt: at('2026-10-25T10:00:00.000Z'),
      source: 'legacy',
    });
    expect(byId(2003)?.era).toBe('');
    expect(byId(2006)).toMatchObject({ name: 'Foxtrot', seenAt: at('2026-10-23T07:01:00.000Z') });
    expect(byId(2007)).toMatchObject({ name: 'Golf', avatar: 'portrait_107', seenAt: 0 });
    expect(byId(2007)?.guild).toBeUndefined();
  });

  it('counts the rows it cannot map: unknown types, missing players, broken note pages', () => {
    // attacks: type 9 and a battle without player; events: a battle without player; items: a player page without a
    // readable player and a page of a missing group
    expect(unmapped).toBe(5);
  });

  it('takes dates as Dexie stores them, and rows from page scripts that are no objects', () => {
    const when = new Date('2026-10-18T08:31:54.508Z');
    const mapped = mapToolbox2(
      {
        attacks: [{ ...v2.neighborhoodAttacks[1], date: when }, null, 'x'],
        players: [],
        events: [],
        groups: [],
        items: [],
      },
      profile,
      NOW,
    );
    expect(mapped.tables.plunders.map((p) => p.at)).toEqual([when.getTime()]);
    expect(mapped.unmapped).toBe(2);
  });

  it('leaves out the events of the own player', () => {
    const own = { ...v2.Events[1], playerid: 1001 };
    expect(mapToolbox2({ ...dump2, events: [own] }, profile, NOW).tables.incoming).toEqual([]);
  });
});

describe('mapToolbox1', () => {
  it('maps battles, plunders and attacks on the own city; 1.x had no notes', () => {
    const { tables, unmapped } = mapToolbox1(dump1, profile, NOW);
    expect(tables.battles.filter(isFought).map((b) => [b.opponent, b.result, b.rounds, b.era])).toEqual([
      [3001, 'won', 2, 'IndustrialAge'],
    ]);
    expect(tables.plunders.map((p) => [p.opponent, p.outcome, p.resources])).toEqual([
      [3001, 'plundered', { steel: 25 }],
    ]);
    expect(tables.incoming.map((a) => [a.kind, a.attacker])).toEqual([['battle', 3003]]);
    expect(tables.noteGroups).toEqual([]);
    expect(tables.notePages).toEqual([]);
    expect(tables.players.map((p) => p.id).sort()).toEqual([3001, 3003]);
    expect(unmapped).toBe(0);
  });
});
