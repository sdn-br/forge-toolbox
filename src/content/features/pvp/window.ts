// The row window of the PvP box: which rows of the list are drawn. An unfolded battle takes the room of its row and of
// its details, counted in row heights, so the details always show whole and the window draws fewer rows meanwhile.
import type { RowWindow } from '../../ui/windowed-rows';

export interface PvpWindow extends RowWindow {
  /** rows drawn, from `top` */
  count: number;
}

/**
 * The rows from `top` that fit into `visible` row heights, row `i` taking one and `extra(i)` more. The first row is
 * always drawn, even when its details are taller than the area. `keep` is a row that has to stay whole in view (the
 * one just unfolded): the window moves down until it fits. At the end of the list the window moves up while rows above
 * fit, so a shorter list or a stale offset never leaves room unused.
 */
export function fitWindow(
  top: number,
  rows: number,
  visible: number,
  extra: (index: number) => number,
  keep?: number,
): PvpWindow {
  const span = (from: number) => {
    let used = 0;
    let count = 0;
    for (let i = from; i < rows; i++) {
      const need = 1 + extra(i);
      if (count > 0 && used + need > visible) break;
      used += need;
      count++;
    }
    return { used, count };
  };
  let first = Math.max(0, Math.min(top, rows - 1));
  let s = span(first);
  if (keep !== undefined && keep >= first && keep < rows) {
    while (keep >= first + s.count) s = span(++first);
  }
  while (first > 0 && first + s.count === rows && s.used + 1 + extra(first - 1) <= visible) {
    first--;
    s = { used: s.used + 1 + extra(first), count: s.count + 1 };
  }
  return { top: first, count: s.count, below: Math.max(0, rows - first - s.count) };
}

/** the loaded rows the window draws; `from` is the index of the first loaded row in the list */
export const rowsShown = <R>(rows: R[], from: number, { top, count }: PvpWindow): R[] => {
  const start = top - from;
  return rows.slice(Math.max(0, start), Math.max(0, start + count));
};
