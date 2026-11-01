// How many table rows fit into the area a box gives a table. The one place that measures layout for row windowing.

/** rows shown while nothing can be measured: before the first layout, or where nothing is laid out. A tall window's
 * worth: the area clips what does not fit, and the first measurement corrects it before the first paint. */
export const FALLBACK_ROWS = 20;

/** the rows that fit below the head; at least one, nothing without a laid out area or row */
export function rowsFitting(areaHeight: number, headHeight: number, rowHeight: number): number | undefined {
  if (areaHeight <= 0 || rowHeight <= 0) return undefined;
  return Math.max(1, Math.floor((areaHeight - headHeight) / rowHeight));
}

/** Follows the table area: `measure` is called with the area element on every render (see `windowedRows`), watches its
 * size and calls `onChange` when the count of rows that fit changes. The row height is the tallest rendered row, so a
 * taller row (a growth line) never gets cut off. It is read when the area is attached or resized, not when rows change
 * inside an area of the same size. `rows` selects the rows that count, for a table whose rows can unfold extra rows that
 * are not row high (the PvP box leaves out its details rows). */
export function rowFit(onChange: () => void, rows = 'tbody tr') {
  let count: number | undefined;
  let area: HTMLElement | undefined;
  let observer: ResizeObserver | undefined;
  const read = () => {
    if (!area) return;
    const head = area.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0;
    const drawn = [...area.querySelectorAll<HTMLElement>(rows)];
    const fits = rowsFitting(area.clientHeight, head, Math.max(0, ...drawn.map((r) => r.offsetHeight)));
    if (fits === undefined || fits === count) return;
    count = fits;
    onChange();
  };
  return {
    rows: () => count ?? FALLBACK_ROWS,
    measure(next: Element | undefined) {
      // gone (an empty list, a minimized box): the last count stays for when it comes back
      if (!next || next === area) return;
      observer?.disconnect();
      area = next as HTMLElement;
      observer = new ResizeObserver(read);
      observer.observe(area);
      read();
    },
  };
}
