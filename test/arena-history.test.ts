import { describe, expect, it } from 'vitest';
import { CHART, chartVm, historyViewModel, niceTicks } from '../src/content/features/pvp/arena/history';
import { playerId, worldId } from '../src/shared/ids';
import type { ArenaLogEntry, ArenaPoints } from '../src/shared/model';

const world = worldId('de20');
/** local time, so the tests hold in any time zone */
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const pts = (when: number, points: number): ArenaPoints => ({ world, at: when, points });
const entry = (when: number, kind: ArenaLogEntry['kind'], points: number): ArenaLogEntry => ({
  world,
  at: when,
  opponent: playerId(1001),
  kind,
  points,
});

describe('the table per day', () => {
  it('buckets in local time, newest day first, around midnight', () => {
    const vm = historyViewModel({
      points: [pts(at(16, 23, 59), 100), pts(at(17, 0, 1), 150)],
      lines: [],
    });
    expect(vm.days.map((d) => d.day)).toEqual(['17.11.', '16.11.']);
    expect(vm.days.map((d) => d.points)).toEqual(['150', '100']);
  });

  it('carries the points over days without a change and lists only days with a row or a line', () => {
    const vm = historyViewModel({
      points: [pts(at(14), 1000), pts(at(18), 1200)],
      lines: [entry(at(16), 'attack', 10)],
    });
    expect(vm.days.map((d) => [d.day, d.points, d.change])).toEqual([
      ['18.11.', '1.200', '+200'],
      ['16.11.', '1.000', '0'],
      ['14.11.', '1.000', '–'],
    ]);
  });

  it('signs the change and colours it', () => {
    const vm = historyViewModel({
      points: [pts(at(14), 1000), pts(at(15), 900), pts(at(15, 20), 950), pts(at(16), 950 + 0)],
      lines: [],
    });
    const by = Object.fromEntries(vm.days.map((d) => [d.day, d]));
    expect(by['15.11.']).toMatchObject({ points: '950', change: '−50', gain: 'bad' });
    expect(by['16.11.']).toMatchObject({ change: '0', gain: 'none' });
    expect(historyViewModel({ points: [pts(at(14), 1), pts(at(15), 5)], lines: [] }).days[0]).toMatchObject({
      change: '+4',
      gain: 'good',
    });
  });

  it('counts attacks and defenses with the ratio in the tooltip, a day with lines only has no points', () => {
    const vm = historyViewModel({
      points: [],
      lines: [
        entry(at(16, 9), 'attack', 400),
        entry(at(16, 10), 'attack', -300),
        entry(at(16, 11), 'attack', 20),
        entry(at(16, 12), 'defense', 55),
        entry(at(16, 13), 'defense', -55),
        entry(at(16, 14), 'defense', -5),
      ],
    });
    expect(vm.days).toEqual([
      {
        day: '16.11.',
        points: '–',
        change: '–',
        gain: 'none',
        attacks: 3,
        attackTip: 'gewonnen:verloren 2:1',
        defenses: 3,
        defenseTip: 'gehalten:verloren 1:2',
      },
    ]);
  });
});

describe('the chart', () => {
  it('has none for fewer than two points', () => {
    expect(chartVm([])).toBeUndefined();
    expect(chartVm([pts(at(16), 5)])).toBeUndefined();
    expect(historyViewModel({ points: [pts(at(16), 5)], lines: [] }).chart).toBeUndefined();
  });

  it('draws a step line: the points stay until the next change', () => {
    const c = chartVm([pts(at(16), 0), pts(at(17), 100), pts(at(18), 50)]);
    const { left, right, top, bottom } = c?.plot ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const mid = (left + right) / 2;
    expect(c?.path).toBe(`M${left} ${bottom}H${mid}V${top}H${right}V${(top + bottom) / 2}`);
    expect(left).toBe(CHART.left);
  });

  it('puts nice ticks on the y axis, 3 to 5 of them, and the line inside them', () => {
    for (const [min, max] of [
      [22_874, 24_720],
      [0, 7],
      [100, 100_000],
      [-500, 300],
    ] as const) {
      const ticks = niceTicks(min, max);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(5);
      expect(ticks[0]).toBeLessThanOrEqual(min);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
    const c = chartVm([pts(at(16), 0), pts(at(17), 100)]);
    expect(c?.yTicks.map((tick) => tick.label)).toEqual(['0', '50', '100']);
    expect(c?.yTicks[0]?.y).toBe(c?.plot.bottom);
  });

  it('ticks the x axis at each local midnight with dd.mm., thinned out for long ranges', () => {
    const c = chartVm([pts(at(14, 8), 1), pts(at(17, 8), 2)]);
    expect(c?.xTicks.map((x) => x.label)).toEqual(['15.11.', '16.11.', '17.11.']);
    const long = chartVm([pts(at(1), 1), pts(new Date(2026, 11, 20).getTime(), 2)]);
    expect(long?.xTicks.length).toBeLessThanOrEqual(5);
    const within = chartVm([pts(at(14, 8), 1), pts(at(14, 9), 2)]);
    expect(within?.xTicks.map((x) => x.label)).toEqual(['14.11.']);
  });

  it('carries time and points in the tooltip of each change, with hover areas that meet', () => {
    const c = chartVm([pts(at(16, 14, 5), 22_874), pts(at(17), 23_274), pts(at(18), 23_000)]);
    expect(c?.marks[0]?.tip).toBe('16.11., 14:05: 22.874 Punkte');
    const [a, b, d] = c?.marks ?? [];
    expect(a?.x1).toBe(b?.x0);
    expect(b?.x1).toBe(d?.x0);
    expect(d?.x1).toBe(c?.plot.right);
  });
});
