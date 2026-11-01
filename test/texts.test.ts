import { describe, expect, it } from 'vitest';
import { containsText, formatPrice, formatWhen, sameName, textFilter } from '../src/content/core/texts';

describe('formatWhen', () => {
  const now = new Date(2026, 9, 19, 15, 0).getTime();
  it('names today and tomorrow', () => {
    expect(formatWhen(new Date(2026, 9, 19, 18, 30).getTime(), now)).toBe('heute 18:30');
    expect(formatWhen(new Date(2026, 9, 20, 4, 14).getTime(), now)).toBe('morgen 04:14');
  });
  it('falls back to date and time', () => {
    expect(formatWhen(new Date(2026, 9, 22, 4, 14).getTime(), now)).toBe('22.10., 04:14');
  });
  it('adds the year to a date of another year', () => {
    expect(formatWhen(new Date(2025, 10, 1, 14, 1).getTime(), now)).toBe('01.11.2025, 14:01');
    expect(formatWhen(new Date(2027, 0, 3, 9, 0).getTime(), now)).toBe('03.01.2027, 09:00');
    // across New Year: yesterday is last year, tomorrow stays tomorrow
    const newYear = new Date(2027, 0, 1, 10, 0).getTime();
    expect(formatWhen(new Date(2026, 11, 31, 22, 0).getTime(), newYear)).toBe('31.12.2026, 22:00');
    expect(formatWhen(new Date(2027, 0, 1, 9, 0).getTime(), new Date(2026, 11, 31, 20, 0).getTime())).toBe(
      'morgen 09:00',
    );
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

describe('containsText', () => {
  it('finds a part in any case, umlauts too', () => {
    expect(containsText('Großer Kölner Dom', 'kölner')).toBe(true);
    expect(containsText('ÄGYPTEN', 'ägy')).toBe(true);
    expect(containsText('Zeus', 'hera')).toBe(false);
  });

  it('trims the part and lets an empty one match every text', () => {
    expect(containsText('Zeus', '  zeu ')).toBe(true);
    expect(containsText('Zeus', '   ')).toBe(true);
    expect(containsText('', '')).toBe(true);
  });

  it('builds one filter that tests many texts', () => {
    const byName = textFilter(' BER ');
    expect(['Bert', 'Anna', 'alberta'].filter(byName)).toEqual(['Bert', 'alberta']);
  });
});

describe('sameName', () => {
  it('compares whole names in any case without trimming', () => {
    expect(sameName('Ärger', 'ärger')).toBe(true);
    expect(sameName('Bert', 'Berta')).toBe(false);
    expect(sameName(' Bert', 'Bert')).toBe(false);
  });
});
