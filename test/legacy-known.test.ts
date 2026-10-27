import { describe, expect, it } from 'vitest';
import { type LocalRows, withoutKnown } from '../src/backup/legacy/known';
import { eraId, guildId, playerId } from '../src/shared/ids';
import type { IncomingAttack, NoteGroup, NotePage, Player, Plunder } from '../src/shared/model';
import { battle, de20, tables } from './helpers/backup';

const MIN = 60_000;
const T = Date.UTC(2026, 9, 20, 12);

const legacyBattle = (at: number, opponent = 2, result: 'won' | 'lost' = 'won') => ({
  ...battle(-at, opponent),
  at,
  result,
});
const gameBattle = (battleId: number, at: number, opponent = 2, result: 'won' | 'lost' = 'won') => ({
  ...battle(battleId, opponent),
  at,
  result,
});
const plunder = (at: number, opponent = 2, outcome: Plunder['outcome'] = 'plundered'): Plunder => ({
  world: de20,
  at,
  opponent: playerId(opponent),
  outcome,
  resources: {},
  doubleLoot: false,
});
const attack = (kind: IncomingAttack['kind'], key: number, at: number, attacker = 3): IncomingAttack => ({
  world: de20,
  kind,
  key,
  at,
  attacker: playerId(attacker),
});
const group = (id: string, sort: number): NoteGroup => ({ world: de20, id, name: id, sort });
const page = (id: string, group: string, text: string, sort: number, updatedAt = T): NotePage => ({
  world: de20,
  id,
  group,
  title: id,
  text,
  sort,
  updatedAt,
});
const player = (id: number, change: Partial<Player> = {}): Player => ({
  world: de20,
  id: playerId(id),
  name: `p${id}`,
  avatar: '',
  cityName: '',
  era: eraId('ColonialAge'),
  score: 0,
  rank: 0,
  active: true,
  relations: { neighbor: false, guildMember: false, friend: false },
  firstSeenAt: 0,
  seenAt: 0,
  source: 'legacy',
  ...change,
});

const local = (change: Partial<LocalRows> = {}): LocalRows => ({
  battles: [],
  plunders: [],
  incoming: [],
  noteGroups: [],
  notePages: [],
  players: [],
  ...change,
});

describe('withoutKnown', () => {
  it('drops a battle the new toolbox recorded too: same opponent and result, about two minutes apart', () => {
    const source = tables({
      battles: [
        legacyBattle(T),
        legacyBattle(T + 10 * MIN),
        legacyBattle(T + 20 * MIN, 2, 'lost'),
        legacyBattle(T + 30 * MIN, 4),
      ],
    });
    const stored = local({
      battles: [
        gameBattle(501, T + 2 * MIN),
        gameBattle(502, T + 10 * MIN + 2 * MIN + 1),
        gameBattle(503, T + 20 * MIN),
        gameBattle(504, T + 30 * MIN, 5),
      ],
    });
    expect(withoutKnown(source, stored).battles.map((b) => b.at)).toEqual([T + 10 * MIN, T + 20 * MIN, T + 30 * MIN]);
  });

  it('matches each stored battle once, so two lost tries in a row stay two', () => {
    const source = tables({ battles: [legacyBattle(T, 2, 'lost'), legacyBattle(T + MIN, 2, 'lost')] });
    const stored = local({ battles: [gameBattle(501, T, 2, 'lost')] });
    expect(withoutKnown(source, stored).battles.map((b) => b.at)).toEqual([T + MIN]);
  });

  it('drops what an earlier import of the old data brought, so a second import adds nothing', () => {
    const source = tables({
      battles: [legacyBattle(T)],
      plunders: [plunder(T)],
      incoming: [attack('battle', -7, T), attack('plunder', 8, T)],
    });
    expect(withoutKnown(source, local(source))).toMatchObject({ battles: [], plunders: [], incoming: [] });
  });

  it('drops a plunder with the same opponent and outcome about two minutes apart', () => {
    const source = tables({ plunders: [plunder(T), plunder(T + 10 * MIN, 2, 'repelled'), plunder(T + 20 * MIN)] });
    const stored = local({ plunders: [plunder(T - MIN), plunder(T + 10 * MIN), plunder(T + 25 * MIN)] });
    expect(withoutKnown(source, stored).plunders.map((p) => p.at)).toEqual([T + 10 * MIN, T + 20 * MIN]);
  });

  it('drops an attack on the own city by its event id or by attacker, kind and time', () => {
    const source = tables({
      incoming: [
        attack('plunder', 8, T),
        attack('battle', -9, T + 10 * MIN),
        attack('battle', -10, T + 20 * MIN),
        attack('plunder', 11, T + 30 * MIN, 4),
      ],
    });
    const stored = local({
      incoming: [
        attack('plunder', 8, T + 60 * MIN),
        attack('battle', 777, T + 11 * MIN),
        attack('plunder', 12, T + 20 * MIN),
        attack('plunder', 13, T + 30 * MIN, 5),
      ],
    });
    expect(withoutKnown(source, stored).incoming.map((a) => a.key)).toEqual([-10, 11]);
  });

  it('adds new note groups behind the stored ones and leaves known groups out', () => {
    const source = tables({ noteGroups: [group('legacy:1', 5), group('legacy:2', 0), group('legacy:3', 1)] });
    const stored = local({ noteGroups: [group('mine', 4), group('legacy:2', 2)] });
    expect(withoutKnown(source, stored).noteGroups).toEqual([group('legacy:3', 5), group('legacy:1', 6)]);
  });

  it('adds new pages behind the stored ones of their group', () => {
    const source = tables({
      notePages: [
        page('player:7', 'players', 'b', 3),
        page('player:6', 'players', 'a', 1),
        page('legacy:1', 'legacy:1', 'c', 0),
      ],
    });
    const stored = local({ notePages: [page('player:5', 'players', 'x', 2)] });
    expect(withoutKnown(source, stored).notePages.map((p) => [p.id, p.sort])).toEqual([
      ['player:6', 3],
      ['player:7', 4],
      ['legacy:1', 0],
    ]);
  });

  it('appends the old text to a stored page that lacks it, and leaves a page that has it', () => {
    const NOW = T + 60 * MIN;
    const source = tables({
      notePages: [page('player:5', 'players', 'old text', 0, NOW), page('player:6', 'players', 'same', 0, NOW)],
    });
    const stored = local({
      notePages: [page('player:5', 'players', 'new text', 4), page('player:6', 'players', 'new\n\nsame', 1)],
    });
    expect(withoutKnown(source, stored).notePages).toEqual([
      { ...page('player:5', 'players', 'new text\n\nold text', 4), updatedAt: NOW },
    ]);
    // a page edited after the import started still gets the text: the merge takes the newer page
    const later = local({ notePages: [page('player:5', 'players', 'new text', 4, NOW + 5)] });
    expect(withoutKnown(source, later).notePages.find((p) => p.id === 'player:5')?.updatedAt).toBe(NOW + 6);
  });

  it('takes the game data of a player from the newer row and keeps what only the stored row knows', () => {
    const stored = player(2, {
      name: 'stored',
      cityName: 'City',
      rank: 12,
      relations: { neighbor: true, guildMember: false, friend: false },
      marked: true,
      marksAt: 5,
      firstSeenAt: 1,
      seenAt: T,
    });
    const newer = player(2, {
      name: 'renamed',
      avatar: 'portrait_9',
      era: eraId('IndustrialAge'),
      score: 900,
      guild: { id: guildId(4), name: 'G' },
      firstSeenAt: T + MIN,
      seenAt: T + MIN,
    });
    expect(withoutKnown(tables({ players: [newer] }), local({ players: [stored] })).players).toEqual([
      {
        ...stored,
        name: 'renamed',
        avatar: 'portrait_9',
        era: 'IndustrialAge',
        score: 900,
        guild: { id: 4, name: 'G' },
        seenAt: T + MIN,
      },
    ]);
    const older = player(2, { name: 'old', seenAt: T - MIN });
    expect(withoutKnown(tables({ players: [older] }), local({ players: [stored] })).players).toEqual([]);
    expect(withoutKnown(tables({ players: [older] }), local()).players).toEqual([older]);
  });

  it('keeps the stored era and avatar when the old row does not know them', () => {
    const stored = player(2, { avatar: 'portrait_1', seenAt: T });
    const newer = player(2, { avatar: '', era: eraId(''), seenAt: T + MIN });
    expect(withoutKnown(tables({ players: [newer] }), local({ players: [stored] })).players[0]).toMatchObject({
      avatar: 'portrait_1',
      era: 'ColonialAge',
    });
  });
});
