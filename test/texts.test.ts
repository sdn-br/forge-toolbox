import { describe, expect, it } from 'vitest';
import { formatPrice, formatWhen } from '../src/content/core/texts';

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

describe('formatPrice', () => {
  it('shows large prices in millions with one decimal', () => {
    expect(formatPrice(45_000_000)).toBe('45 Mio.');
    expect(formatPrice(600_000)).toBe('0,6 Mio.');
    expect(formatPrice(15_640_000)).toBe('15,6 Mio.');
  });
  it('shows small prices whole', () => {
    expect(formatPrice(2_000)).toBe('2.000');
  });
});
