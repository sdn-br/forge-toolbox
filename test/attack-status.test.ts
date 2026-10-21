import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/content/core/texts';
import { attackStatus } from '../src/content/features/sabotage/attack-status';
import { playerId, worldId } from '../src/shared/ids';
import type { AttackTimer, CityShield } from '../src/shared/model';

const now = new Date(2026, 9, 19, 15, 0).getTime();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const neighbor = { neighbor: true, friend: false, guildMember: false };
const shield = (expiresAt: number): CityShield => ({ world: worldId('de20'), player: playerId(1), expiresAt });
const plunderable = (until: number): AttackTimer => ({ canPlunder: true, nextInteractionAt: until });
const waiting = (until: number): AttackTimer => ({ canPlunder: false, nextInteractionAt: until });

const status = (timer?: AttackTimer, s?: CityShield, relation = neighbor) => attackStatus(relation, timer, s, now);

describe('attack status in the city information', () => {
  it('is plunderable until the deadline of a won, unplundered battle', () => {
    expect(status(plunderable(now + 5 * HOUR + 3 * MINUTE))).toEqual({
      kind: 'plunderable',
      text: 'Plünderbar noch 5 Std. 3 Min. (bis heute 20:03)',
    });
  });

  it('is attackable again after the timer when there is nothing to plunder', () => {
    expect(status(waiting(now + 20 * HOUR))).toEqual({
      kind: 'waiting',
      text: 'Wieder angreifbar in 20 Std. (ab morgen 11:00)',
    });
  });

  it('is shielded until the end of the shield, with the remaining time', () => {
    expect(status(undefined, shield(now + 51 * HOUR))).toEqual({
      kind: 'shielded',
      text: 'Stadt geschützt bis 21.10., 18:00 (noch 2 T. 3 Std.)',
    });
  });

  it('is attackable without timer and shield, also once they ran out', () => {
    expect(status()).toEqual({ kind: 'attackable', text: 'angreifbar' });
    expect(status(waiting(now - MINUTE), shield(now))).toEqual({ kind: 'attackable', text: 'angreifbar' });
    expect(status(plunderable(now - MINUTE)).kind).toBe('attackable');
    // without a deadline a plunderable flag cannot be trusted to still hold
    expect(status({ canPlunder: true }).kind).toBe('attackable');
  });

  it('puts a shield over the timer and plunderable over the shield', () => {
    expect(status(waiting(now + HOUR), shield(now + 2 * HOUR)).kind).toBe('shielded');
    expect(status(plunderable(now + HOUR), shield(now + 2 * HOUR)).kind).toBe('plunderable');
  });

  it('gives the reason when the player cannot be attacked at all', () => {
    const timer = plunderable(now + HOUR);
    expect(status(timer, undefined, { ...neighbor, friend: true })).toEqual({
      kind: 'friend',
      text: 'Freund, nicht angreifbar',
    });
    expect(status(timer, undefined, { ...neighbor, guildMember: true })).toEqual({
      kind: 'guildMember',
      text: 'Gildenmitglied, nicht angreifbar',
    });
    expect(status(timer, undefined, { ...neighbor, neighbor: false })).toEqual({
      kind: 'notNeighbor',
      text: 'Kein Nachbar, nicht angreifbar',
    });
  });
});

describe('formatDuration', () => {
  it('shows the two largest units and rounds up to the minute', () => {
    expect(formatDuration(30_000)).toBe('1 Min.');
    expect(formatDuration(59 * MINUTE + 1)).toBe('1 Std.');
    expect(formatDuration(HOUR + 59 * MINUTE + 1)).toBe('2 Std.');
    expect(formatDuration(2 * 24 * HOUR + 30 * MINUTE)).toBe('2 T. 1 Std.');
    expect(formatDuration(24 * HOUR)).toBe('1 T.');
    expect(formatDuration(0)).toBe('0 Min.');
  });
});
