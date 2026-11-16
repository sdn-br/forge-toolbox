import { describe, expect, it } from 'vitest';
import { MATCH_WINDOW, matchBattles } from '../src/content/features/pvp/arena/match';
import { arenaFilter } from '../src/content/features/pvp/arena/section';
import { arenaViewModel } from '../src/content/features/pvp/arena/view-model';
import { filtersPlayers, isFiltered, NO_FILTER, opponentsFor, type ViewInput } from '../src/content/features/pvp/rows';
import { formatArenaAttackSummary, formatArenaDefenseSummary } from '../src/content/features/shared/pvp-format';
import { eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { ArenaBattle, ArenaLogEntry, ArenaLogSummary, Player } from '../src/shared/model';
import { playerLookups } from './helpers/player-lookups';

const now = new Date(2026, 10, 10, 15, 0).getTime();
const at = (h: number, m: number, s = 0) => new Date(2026, 10, 10, h, m, s).getTime();

const line = (when: number, opponent: number, kind: ArenaLogEntry['kind'], points: number): ArenaLogEntry => ({
  world: worldId('de20'),
  at: when,
  opponent: playerId(opponent),
  kind,
  points,
});

const fought = (battleId: number, when: number, opponent: number, change: Partial<ArenaBattle> = {}): ArenaBattle => ({
  world: worldId('de20'),
  battleId,
  at: when,
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 4,
  era: eraId('VirtualFuture'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
  points: 400,
  ...change,
});

const names: Record<number, string> = { 1002: 'Testgegner 2' };
const base: ViewInput = {
  filter: NO_FILTER,
  lookups: playerLookups({ playerName: (id: PlayerId) => names[id] }),
  building: () => undefined,
  resourceName: () => undefined,
  unit: () => undefined,
  note: () => undefined,
  now,
};

const summaryOf = (lines: ArenaLogEntry[]): ArenaLogSummary => {
  const attacks = lines.filter((l) => l.kind === 'attack');
  const won = attacks.filter((l) => l.points > 0).length;
  return {
    attacks: attacks.length,
    won,
    lost: attacks.length - won,
    defenses: lines.length - attacks.length,
    points: lines.reduce((sum, l) => sum + l.points, 0),
  };
};

const vmOf = (
  all: ArenaLogEntry[],
  battles: ArenaBattle[] = [],
  change: Partial<ViewInput> = {},
  kind: ArenaLogEntry['kind'] = 'attack',
) => {
  // the sub tab reads only the lines of its kind
  const lines = all.filter((l) => l.kind === kind);
  return arenaViewModel({
    ...base,
    ...change,
    kind,
    lines,
    matched: matchBattles(lines, battles),
    summary: summaryOf(lines),
    from: 0,
  });
};

describe('arena view model', () => {
  const lines = [
    line(at(13, 50), 1002, 'attack', 400),
    line(at(13, 45), 1004, 'attack', -535),
    line(at(9, 15), 1008, 'defense', -55),
  ];

  it('shows one attack row per attack line with name, time, result and signed points', () => {
    const vm = vmOf(lines);
    expect(vm).toMatchObject({ tab: 'arena', kind: 'attack', total: 2, from: 0, empty: undefined });
    expect(vm.rows[0]).toEqual({
      opponent: 1002,
      name: 'Testgegner 2',
      nameTip: 'Testgegner 2',
      url: 'https://foestats.com/de/de20/players/1002',
      picked: false,
      note: '',
      at: at(13, 50),
      when: 'heute 13:50',
      outcome: 'won',
      result: 'Angriff gewonnen',
      points: '+400',
      gain: 'good',
      selected: false,
    });
    expect(vm.rows.slice(1).map((r) => [r.name, r.outcome, r.result, r.points, r.gain])).toEqual([
      ['1004', 'lost', 'Angriff verloren', '−535', 'bad'],
    ]);
  });

  it('shows a defense row with signed points and without any result, even with negative points', () => {
    const vm = vmOf(lines, [], {}, 'defense');
    expect(vm).toMatchObject({ kind: 'defense', total: 1 });
    expect(vm.rows).toHaveLength(1);
    const row = vm.rows[0];
    expect(row).toMatchObject({ name: '1008', points: '−55', gain: 'bad', at: at(9, 15), selected: false });
    expect(row).not.toHaveProperty('outcome');
    expect(row).not.toHaveProperty('result');
  });

  it('marks the selected defense line by opponent and time', () => {
    const selectedDefense = { opponent: playerId(1008), at: at(9, 15) };
    expect(vmOf(lines, [], { selectedDefense }, 'defense').rows[0]?.selected).toBe(true);
    expect(vmOf(lines, [], { selectedDefense: { ...selectedDefense, at: 1 } }, 'defense').rows[0]?.selected).toBe(
      false,
    );
  });

  it('makes only an attack with its stored battle selectable, and marks the selected one', () => {
    const battles = [fought(5001, at(13, 50), 1002), fought(5000, at(13, 45), 1004, { result: 'lost', points: -535 })];
    const vm = vmOf(lines, battles, { selected: 5000 });
    expect(vm.rows.map((r) => r.battleId)).toEqual([5001, 5000]);
    expect(vm.rows.map((r) => r.selected)).toEqual([false, true]);
    expect(vmOf(lines).rows.every((r) => r.battleId === undefined)).toBe(true);
  });

  it('sums up the lines of the sub tab the filter matches', () => {
    expect(vmOf(lines).totals).toBe('2 Angriffe, 1 gewonnen, 1 verloren · −135 Punkte');
    expect(vmOf(lines, [], {}, 'defense').totals).toBe('1 Verteidigung · −55 Punkte');
  });

  it('tells no lines from no match on each sub tab', () => {
    expect(vmOf([]).empty).toBe('none');
    expect(vmOf([], [], {}, 'defense').empty).toBe('none');
    const named = { ...NO_FILTER, name: 'x' };
    expect(vmOf([], [], { filter: named }).empty).toBe('noMatch');
    expect(vmOf([], [], { filter: named }, 'defense').empty).toBe('noMatch');
  });
});

describe('arena marks', () => {
  it('shows the arena mark of a known player instead of the neighbourhood marks', () => {
    const lookups = playerLookups({
      playerName: (id: PlayerId) => names[id],
      plunderWorthy: (id: PlayerId) => (id === 1002 ? true : undefined),
      noAttack: (id: PlayerId) => (id === 1002 ? true : undefined),
      arenaNoAttack: (id: PlayerId) => (id === 1002 ? false : undefined),
    });
    const vm = vmOf([line(at(13, 50), 1002, 'attack', 400), line(at(13, 45), 1004, 'attack', -535)], [], { lookups });
    expect(vm.rows[0]?.arenaNoAttack).toBe(false);
    expect(vm.rows[0]).not.toHaveProperty('plunderWorthy');
    expect(vm.rows[0]).not.toHaveProperty('noAttack');
    // a player the store does not know cannot be marked
    expect(vm.rows[1]).not.toHaveProperty('arenaNoAttack');
  });

  const player = (id: number, marks: Partial<Player> = {}) =>
    ({ id: playerId(id), name: `P${id}`, ...marks }) as Player;
  const players = [
    player(1, { arenaNoAttack: true }),
    player(2, { noAttack: true }),
    player(3, { plunderWorthy: true, arenaNoAttack: true }),
    player(4),
  ];
  const arenaMarks = (noAttack: boolean, none: boolean) => ({ ...NO_FILTER, arenaMarks: { noAttack, none } });

  it('filters the arena by its own mark alone; the neighbourhood toggles play no part there', () => {
    expect(opponentsFor(arenaMarks(true, true), players, 'arena')).toEqual({});
    expect(opponentsFor(arenaMarks(true, false), players, 'arena')).toEqual({ opponents: [1, 3] });
    // without the arena mark the unknown players stay, so the known marked ones are left out
    expect(opponentsFor(arenaMarks(false, true), players, 'arena')).toEqual({ exceptOpponents: [1, 3] });
    expect(opponentsFor(arenaMarks(false, false), players, 'arena')).toEqual({ opponents: [] });
    expect(opponentsFor({ ...arenaMarks(true, false), name: 'P1' }, players, 'arena')).toEqual({ opponents: [1] });
    const neighbourhoodOff = { ...NO_FILTER, marks: { plunder: false, noAttack: false, none: false } };
    expect(opponentsFor(neighbourhoodOff, players, 'arena')).toEqual({});
  });

  it('leaves the other tabs to the neighbourhood toggles', () => {
    expect(opponentsFor(arenaMarks(false, false), players, 'battles')).toEqual({});
    expect(opponentsFor(arenaMarks(false, false), players, 'incoming')).toEqual({});
    expect(filtersPlayers(arenaMarks(false, true), 'battles')).toBe(false);
    expect(filtersPlayers(arenaMarks(false, true), 'arena')).toBe(true);
    expect(isFiltered(arenaMarks(true, false), 'arena')).toBe(true);
    expect(isFiltered(arenaMarks(true, false), 'incoming')).toBe(false);
  });
});

describe('arena summary', () => {
  const full = (s: Partial<ArenaLogSummary>): ArenaLogSummary => ({
    attacks: 0,
    won: 0,
    lost: 0,
    defenses: 0,
    points: 0,
    ...s,
  });

  it('names the attacks with the won and lost ones and the points, in singular for one', () => {
    expect(formatArenaAttackSummary(full({ attacks: 80, won: 68, lost: 12, defenses: 7, points: 12345 }))).toBe(
      '80 Angriffe, 68 gewonnen, 12 verloren · +12.345 Punkte',
    );
    expect(formatArenaAttackSummary(full({ attacks: 1, won: 0, lost: 1, points: -10 }))).toBe(
      '1 Angriff, 0 gewonnen, 1 verloren · −10 Punkte',
    );
    expect(formatArenaAttackSummary(full({}))).toBe('0 Angriffe · 0 Punkte');
  });

  it('names the defenses and their points, ignoring the attacks', () => {
    expect(formatArenaDefenseSummary(full({ attacks: 5, defenses: 7, points: -3456 }))).toBe(
      '7 Verteidigungen · −3.456 Punkte',
    );
    expect(formatArenaDefenseSummary(full({ defenses: 1, points: -55 }))).toBe('1 Verteidigung · −55 Punkte');
    expect(formatArenaDefenseSummary(full({}))).toBe('0 Verteidigungen · 0 Punkte');
  });
});

describe('arena filter', () => {
  const scope = { opponents: [playerId(1)] };

  it('asks for the lines of the sub tab within the scope', () => {
    expect(arenaFilter(scope, 'attack')).toEqual({ ...scope, kind: 'attack' });
    expect(arenaFilter({}, 'defense')).toEqual({ kind: 'defense' });
  });

  it('does not count the sub tab as a filter', () => {
    expect(isFiltered(NO_FILTER, 'arena')).toBe(false);
  });
});

describe('matching arena battles to log lines', () => {
  const won = line(at(14, 0), 1002, 'attack', 400);
  const manual = (battleId: number, when: number, change: Partial<ArenaBattle> = {}) =>
    fought(battleId, when, 1002, { auto: false, ...change });

  it('matches an auto battle whose line has its start time, to the second', () => {
    expect(matchBattles([won], [fought(1, at(14, 0), 1002)])).toEqual([fought(1, at(14, 0), 1002)]);
    expect(matchBattles([won], [fought(1, at(14, 0) - 1000, 1002)])).toEqual([undefined]);
  });

  it('matches a manual battle whose line comes when it ends, within the window', () => {
    // the fixture of a manual battle: started 145 s before its line
    expect(matchBattles([won], [manual(1, at(14, 0) - 145_000)])[0]?.battleId).toBe(1);
    expect(matchBattles([won], [manual(1, at(14, 0))])[0]?.battleId).toBe(1);
    expect(matchBattles([won], [manual(1, at(14, 0) - MATCH_WINDOW)])[0]?.battleId).toBe(1);
    expect(matchBattles([won], [manual(1, at(14, 0) - MATCH_WINDOW - 1000)])).toEqual([undefined]);
  });

  it('matches no battle that started after the line, against another opponent or with other points', () => {
    expect(matchBattles([won], [manual(1, at(14, 0) + 1000)])).toEqual([undefined]);
    expect(matchBattles([won], [fought(1, at(14, 0), 1003)])).toEqual([undefined]);
    expect(matchBattles([won], [fought(1, at(14, 0), 1002, { points: 401 })])).toEqual([undefined]);
  });

  it('matches a battle without points by its result against the sign of the points', () => {
    const { points: _, ...noPoints } = fought(1, at(14, 0), 1002);
    expect(matchBattles([won], [noPoints])[0]?.battleId).toBe(1);
    expect(matchBattles([won], [{ ...noPoints, result: 'lost' }])).toEqual([undefined]);
    const lost = line(at(14, 0), 1002, 'attack', -300);
    expect(matchBattles([lost], [{ ...noPoints, result: 'surrendered' }])[0]?.battleId).toBe(1);
  });

  it('gives each battle the earliest line that fits it, each line one battle', () => {
    const later = line(at(14, 5), 1002, 'attack', 400);
    // two manual battles in a row against the same player for the same points
    const battles = [manual(1, at(13, 58)), manual(2, at(14, 3))];
    expect(matchBattles([later, won], battles).map((b) => b?.battleId)).toEqual([2, 1]);
    // a battle the toolbox did not see (another device) leaves its line without one, the other keeps its own
    expect(matchBattles([later, won], [manual(1, at(13, 58))]).map((b) => b?.battleId)).toEqual([undefined, 1]);
  });

  it('never matches a defense', () => {
    const defense = line(at(14, 0), 1002, 'defense', 400);
    expect(matchBattles([defense], [fought(1, at(14, 0), 1002)])).toEqual([undefined]);
  });
});
