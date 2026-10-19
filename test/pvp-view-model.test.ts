import { describe, expect, it } from 'vitest';
import { pruneBefore } from '../src/content/features/pvp/retention';
import { opponentsFor, pageCount, pvpViewModel } from '../src/content/features/pvp/view-model';
import { eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { Battle, Player } from '../src/shared/model';

const now = new Date(2026, 9, 19, 15, 0).getTime();
const DAY = 86_400_000;

const battle = (battleId: number, opponent: number, change: Partial<Battle> = {}): Battle => ({
  world: worldId('de20'),
  battleId,
  at: new Date(2026, 9, 19, 13, 49).getTime(),
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 2,
  era: eraId('ColonialAge'),
  attacker: { bonuses: { attack_boost: 233, attacker_defense_boost: 134, military_boost: 135 }, units: [] },
  defender: {
    bonuses: { defender_attack_boost: 353, defense_boost: 390, fierce_resistance: 32.5, advanced_tactics: 20.5 },
    units: [],
  },
  ...change,
});

const player = (id: number, name: string) => ({ id: playerId(id), name }) as Player;
const names: Record<number, string> = { 1001: 'Testgegner' };
const name = (id: PlayerId) => names[id];

describe('pvp view model', () => {
  it('shows one row per battle with name, time, result and measured armies', () => {
    const vm = pvpViewModel({
      battles: [battle(1, 1001), battle(2, 1002, { result: 'surrendered', auto: false, rounds: 5 })],
      total: 2,
      page: 0,
      filter: { text: '' },
      name,
      now,
    });
    expect(vm.rows[0]).toEqual({
      battleId: 1,
      opponent: 1001,
      name: 'Testgegner',
      when: 'heute 13:49',
      result: 'gewonnen',
      battle: 'Autokampf',
      attacker: { attack: 368, defense: 269 },
      defender: { attack: 406, defense: 443 },
    });
    expect(vm.rows[1]).toMatchObject({ name: '1002', result: 'aufgegeben', battle: '5 Runden' });
    expect(vm).toMatchObject({ page: 0, pages: 1, empty: undefined, picked: undefined });
  });

  it('names one round in singular', () => {
    const vm = pvpViewModel({
      battles: [battle(1, 1001, { auto: false, rounds: 1 }), battle(2, 1001, { auto: false, rounds: 4 })],
      total: 2,
      page: 0,
      filter: { text: '' },
      name,
      now,
    });
    expect(vm.rows.map((r) => r.battle)).toEqual(['1 Runde', '4 Runden']);
  });

  it('tells no battles from no match and names the picked player', () => {
    const base = { battles: [], total: 0, page: 0, name, now };
    expect(pvpViewModel({ ...base, filter: { text: '' } }).empty).toBe('none');
    expect(pvpViewModel({ ...base, filter: { text: 'xy' } }).empty).toBe('noMatch');
    const picked = pvpViewModel({ ...base, filter: { text: '', opponent: playerId(1001) } });
    expect(picked).toMatchObject({ empty: 'noMatch', picked: 'Testgegner' });
  });

  it('counts pages of 20', () => {
    expect([0, 20, 21, 41].map(pageCount)).toEqual([1, 1, 2, 3]);
  });
});

describe('pvp filter', () => {
  const players = [player(1, 'Anna'), player(2, 'Hannes'), player(3, 'Bert')];

  it('matches names by text, ignoring case', () => {
    expect(opponentsFor({ text: ' ann' }, players)).toEqual([1, 2]);
    expect(opponentsFor({ text: 'zz' }, players)).toEqual([]);
    expect(opponentsFor({ text: ' ' }, players)).toBeUndefined();
  });

  it('prefers a picked player over the text', () => {
    expect(opponentsFor({ text: 'ann', opponent: playerId(3) }, players)).toEqual([3]);
  });
});

describe('battle retention', () => {
  it('keeps everything by default and cuts at the chosen number of days', () => {
    expect(pruneBefore('forever', now)).toBeUndefined();
    expect(pruneBefore('30', now)).toBe(now - 30 * DAY);
    expect(pruneBefore('365', now)).toBe(now - 365 * DAY);
  });
});
