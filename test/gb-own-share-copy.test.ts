import { describe, expect, it } from 'vitest';
import type { OwnPlace, OwnShareCalc } from '../src/content/domain/gb-own-share';
import { type CopyOptions, copyText, DEFAULT_COPY } from '../src/content/features/gb-own-share/view-model';

const place = (rank: number, amount: number, extra: Partial<OwnPlace> = {}) =>
  ({ rank, amount, full: false, levels: false, ...extra }) as OwnPlace;

/** P1 safe, P2 in danger, P3 levels the building */
const calc = {
  places: [place(1, 4950), place(2, 2480, { danger: 40 }), place(3, 827, { levels: true })],
  safeRanks: [1],
  open: 0,
} as unknown as OwnShareCalc;

const about = { player: 'Ich', building: 'Arche', level: 135, factor: [90, 90, 90, 90, 90] };
const text = (o: Partial<CopyOptions>) => copyText(calc, { ...DEFAULT_COPY, mode: 'all', ...o }, about);

describe('warning signs in the copy text', () => {
  it('are off by default', () => {
    expect(text({})).toBe('Ich Arche P3(827) P2(2480) P1(4950)');
  });

  it('put the prefix once in front and the suffix after each place in danger or that levels', () => {
    expect(text({ warn: true, warnSuffix: '!' })).toBe('!!! Ich Arche P3(827) ! P2(2480) ! P1(4950)');
  });

  it('leave out an empty prefix or suffix', () => {
    expect(text({ warn: true })).toBe('!!! Ich Arche P3(827) P2(2480) P1(4950)');
    expect(text({ warn: true, warnPrefix: '', warnSuffix: '!' })).toBe('Ich Arche P3(827) ! P2(2480) ! P1(4950)');
  });

  it('give no prefix when no marked place is in the text', () => {
    expect(text({ warn: true, mode: 'auto' })).toBe('Ich Arche P1(4950)');
  });
});

describe('the factor in the copy text', () => {
  const withFactor = (factor: number[]) =>
    copyText(calc, { ...DEFAULT_COPY, mode: 'all', fp: false, factor: true }, { ...about, factor });

  it('shows one factor when all places share it', () => {
    expect(withFactor([90, 90, 90, 90, 90])).toBe('Ich Arche 1,9 P3 P2 P1');
  });

  it('shows the lowest and the highest factor when the places differ', () => {
    expect(withFactor([90, 80, 90, 95.5, 90])).toBe('Ich Arche 1,8/1,955 P3 P2 P1');
  });
});
