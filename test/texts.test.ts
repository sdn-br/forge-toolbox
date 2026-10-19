import { describe, expect, it } from 'vitest';
import { formatWhen } from '../src/content/core/texts';

describe('formatWhen', () => {
  const now = new Date(2026, 9, 19, 15, 0).getTime();
  it('names today and tomorrow', () => {
    expect(formatWhen(new Date(2026, 9, 19, 18, 30).getTime(), now)).toBe('heute 18:30');
    expect(formatWhen(new Date(2026, 9, 20, 4, 14).getTime(), now)).toBe('morgen 04:14');
  });
  it('falls back to date and time', () => {
    expect(formatWhen(new Date(2026, 9, 22, 4, 14).getTime(), now)).toBe('22.10., 04:14');
  });
});
