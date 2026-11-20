// The history of the arena points in the side panel: a step chart over all stored points and a table per day. The
// functions are pure; the section reads the points and the log lines.
import type { ArenaLogEntry, ArenaPoints } from '../../../../shared/model';
import { formatDateTime, formatNumber, signed, t } from '../../../core/texts';

/** the chart in its own coordinates; the SVG scales it to the width of the panel */
export const CHART = { width: 280, height: 150, left: 46, right: 8, top: 8, bottom: 20 } as const;

/** at most this many day ticks on the time axis */
const MAX_X_TICKS = 5;
/** the y axis aims at this many steps, which gives 3 to 5 ticks */
const Y_STEPS = 3;

const dayFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
/** "18.11." */
const dayLabel = (epochMs: number) => dayFormat.format(epochMs);

/** the start of the local day of a time, in ms */
const startOfDay = (epochMs: number) => {
  const d = new Date(epochMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/** the start of the next local day; not +24 h, a day is 23 or 25 h long when the clock changes */
const nextDay = (dayStart: number) => {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

/** a step of 1, 2 or 5 times a power of ten that is at least `raw` */
const niceStep = (raw: number) => {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
};

/** the tick values of the y axis, from at most the lowest to at least the highest value; steps are whole points */
export function niceTicks(min: number, max: number): number[] {
  const step = Math.max(1, niceStep(Math.max(max - min, 1) / Y_STEPS));
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; ; v += step) {
    ticks.push(v);
    if (v >= max) return ticks;
  }
}

/** a point of the chart that shows its tooltip: the change, with the area of the chart that belongs to it */
export interface ChartMark {
  x: number;
  y: number;
  /** the hover area: half way to the neighbours */
  x0: number;
  x1: number;
  tip: string;
}

export interface HistoryChartVm {
  /** the path of the step line */
  path: string;
  /** the plot area */
  plot: { left: number; right: number; top: number; bottom: number };
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
  marks: ChartMark[];
}

/** the chart over all points, oldest first; none for fewer than two, which draw no line */
export function chartVm(points: ArenaPoints[]): HistoryChartVm | undefined {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) return undefined;
  const values = points.map((p) => p.points);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const lo = ticks[0] as number;
  const hi = ticks[ticks.length - 1] as number;
  const plot = {
    left: CHART.left,
    right: CHART.width - CHART.right,
    top: CHART.top,
    bottom: CHART.height - CHART.bottom,
  };
  const span = Math.max(last.at - first.at, 1);
  const x = (at: number) => plot.left + ((at - first.at) / span) * (plot.right - plot.left);
  const y = (value: number) => plot.bottom - ((value - lo) / Math.max(hi - lo, 1)) * (plot.bottom - plot.top);

  // the line stays at the points until the next change
  const path = points.map((p, i) => (i === 0 ? `M${x(p.at)} ${y(p.points)}` : `H${x(p.at)}V${y(p.points)}`)).join('');

  const marks = points.map((p, i): ChartMark => {
    const prev = points[i - 1];
    const next = points[i + 1];
    return {
      x: x(p.at),
      y: y(p.points),
      x0: prev ? (x(prev.at) + x(p.at)) / 2 : plot.left,
      x1: next ? (x(p.at) + x(next.at)) / 2 : plot.right,
      tip: t('pvp.arena.history.pointTip', { when: formatDateTime(p.at), points: formatNumber(p.points) }),
    };
  });

  // a tick at each midnight in the range, thinned out to a few days; a range inside one day gets one at its start
  const midnights: number[] = [];
  const firstDay = startOfDay(first.at);
  for (let d = firstDay >= first.at ? firstDay : nextDay(firstDay); d <= last.at; d = nextDay(d)) midnights.push(d);
  const every = Math.ceil(midnights.length / MAX_X_TICKS);
  const days = midnights.length ? midnights.filter((_, i) => i % every === 0) : [first.at];
  return {
    path,
    plot,
    yTicks: ticks.map((v) => ({ y: y(v), label: formatNumber(v) })),
    xTicks: days.map((d) => ({ x: x(d), label: dayLabel(d) })),
    marks,
  };
}

/** a day of the table */
export interface HistoryDayRow {
  /** "18.11." */
  day: string;
  /** the points at the end of the day; "–" before the first stored points */
  points: string;
  /** the change against the end of the day before, signed; "–" when there is no stored points before the day */
  change: string;
  gain: 'good' | 'bad' | 'none';
  attacks: number;
  /** "gewonnen:verloren" */
  attackTip: string;
  defenses: number;
  /** "gehalten:verloren" */
  defenseTip: string;
}

export interface ArenaHistoryVm {
  /** without one the panel says that there are too few points */
  chart?: HistoryChartVm;
  /** newest day first */
  days: HistoryDayRow[];
}

const NONE = '–';

/** the last row before the time, from rows oldest first */
const lastBefore = (points: ArenaPoints[], end: number): ArenaPoints | undefined => {
  let found: ArenaPoints | undefined;
  for (const p of points) {
    if (p.at >= end) break;
    found = p;
  }
  return found;
};

/** won: points above 0; every other line counts as lost, as the summary of the log does */
const ratio = (lines: ArenaLogEntry[]) => {
  const won = lines.filter((l) => l.points > 0).length;
  return { won, lost: lines.length - won };
};

/** the points and the log lines in any order; days in local time, a day appears with a points row or a line */
export function historyViewModel(input: { points: ArenaPoints[]; lines: ArenaLogEntry[] }): ArenaHistoryVm {
  const points = [...input.points].sort((a, b) => a.at - b.at);
  const days = new Set([...points.map((p) => p.at), ...input.lines.map((l) => l.at)].map(startOfDay));
  const rows = [...days]
    .sort((a, b) => b - a)
    .map((start): HistoryDayRow => {
      const end = nextDay(start);
      const atEnd = lastBefore(points, end);
      const before = lastBefore(points, start);
      const change = atEnd && before ? atEnd.points - before.points : undefined;
      const of = (kind: ArenaLogEntry['kind']) =>
        input.lines.filter((l) => l.kind === kind && l.at >= start && l.at < end);
      const attacks = of('attack');
      const defenses = of('defense');
      const a = ratio(attacks);
      const d = ratio(defenses);
      return {
        day: dayLabel(start),
        points: atEnd ? formatNumber(atEnd.points) : NONE,
        change: change === undefined ? NONE : signed(change),
        gain: change === undefined ? 'none' : change > 0 ? 'good' : change < 0 ? 'bad' : 'none',
        attacks: attacks.length,
        attackTip: t('pvp.arena.history.attackTip', { won: a.won, lost: a.lost }),
        defenses: defenses.length,
        defenseTip: t('pvp.arena.history.defenseTip', { held: d.won, lost: d.lost }),
      };
    });
  const chart = chartVm(points);
  return { ...(chart && { chart }), days: rows };
}
