import { describe, expect, it } from 'vitest';
import { parseEventDate } from '../src/content/game/event-date';

// a Tuesday
const now = new Date(2026, 9, 20, 16, 31).getTime();
const at = (day: number, h: number, m: number, month = 9) => new Date(2026, month, day, h, m).getTime();

describe('event dates', () => {
  it('reads today and yesterday, with and without "Uhr"', () => {
    expect(parseEventDate('heute um 16:23 Uhr', now)).toBe(at(20, 16, 23));
    expect(parseEventDate('heute um 05:19 Uhr', now)).toBe(at(20, 5, 19));
    expect(parseEventDate('gestern um 22:48', now)).toBe(at(19, 22, 48));
    expect(parseEventDate('gestern um 00:29 Uhr', now)).toBe(at(19, 0, 29));
  });

  it('takes a weekday as its most recent past day, never today', () => {
    expect(parseEventDate('Montag um 10:00', now)).toBe(at(19, 10, 0));
    expect(parseEventDate('Sonntag um 19:57', now)).toBe(at(18, 19, 57));
    expect(parseEventDate('Samstag um 20:25', now)).toBe(at(17, 20, 25));
    expect(parseEventDate('Mittwoch um 08:00', now)).toBe(at(14, 8, 0));
    expect(parseEventDate('Dienstag um 23:00', now)).toBe(at(13, 23, 0));
  });

  it('crosses month boundaries', () => {
    const first = new Date(2026, 10, 1, 9, 0).getTime();
    expect(parseEventDate('gestern um 12:00', first)).toBe(at(31, 12, 0));
    expect(parseEventDate('Mittwoch um 12:00', first)).toBe(at(28, 12, 0));
  });

  it('gives nothing for text it does not know', () => {
    for (const text of ['vor 5 Minuten', 'Feiertag um 10:00', 'heute um 24:00', 'heute um 10:60', 'heute', '']) {
      expect(parseEventDate(text, now)).toBeUndefined();
    }
  });
});
