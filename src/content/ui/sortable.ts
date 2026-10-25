// Tables sorted by a click on a column head: the snipe helper and both tabs of the investments.
import { html, type TemplateResult } from 'lit-html';
import { type TextKey, t } from '../core/texts';

/** a column and its direction */
export interface SortLevel<C extends string> {
  column: C;
  /** largest first */
  desc: boolean;
}

/** the sort levels, the first one the main order and each further one only breaks the ties of those before it */
export type Sort<C extends string> = SortLevel<C>[];

/**
 * A click on a column head. Plain: this column alone, the same single column turns around, another starts with its
 * natural direction. With `append` (shift): the column becomes the next level, or, already a level, turns only its own
 * direction and keeps its place.
 */
export function nextSort<C extends string>(
  current: Sort<C> | undefined,
  column: C,
  descFirst: ReadonlySet<C>,
  append = false,
): Sort<C> {
  const levels = current ?? [];
  const natural = { column, desc: descFirst.has(column) };
  if (append) {
    if (!levels.some((l) => l.column === column)) return [...levels, natural];
    return levels.map((l) => (l.column === column ? { column, desc: !l.desc } : l));
  }
  const only = levels.length === 1 ? levels[0] : undefined;
  return only?.column === column ? [{ column, desc: !only.desc }] : [natural];
}

/**
 * Sorts `rows` in place level by level; stable, so rows equal in every level keep their order. A level whose value is
 * undefined for a row puts that row after the others in that level, in either direction.
 */
export function sortRows<T, C extends string>(
  rows: T[],
  sort: Sort<C>,
  key: (column: C) => (row: T) => number | string | undefined,
): T[] {
  const levels = sort.map((l) => ({ get: key(l.column), sign: l.desc ? -1 : 1 }));
  return rows.sort((a, b) => {
    for (const { get, sign } of levels) {
      const x = get(a);
      const y = get(b);
      if (x === undefined || y === undefined) {
        const unknown = Number(x === undefined) - Number(y === undefined);
        if (unknown !== 0) return unknown;
        continue;
      }
      const diff = typeof x === 'string' ? x.localeCompare(String(y), 'de') : x - (y as number);
      if (diff !== 0) return sign * diff;
    }
    return 0;
  });
}

/** a sortable column; a narrow column shows `icon` or an abbreviation with the word in tooltip and label */
export interface SortColumn<C extends string> {
  column: C;
  label: TextKey;
  num: boolean;
  icon?: TemplateResult;
  /** the whole word of an abbreviated head, for tooltip and label */
  full?: TextKey;
}

/** the head of a sortable column, marked with the direction (and from two levels on the level) while it is sorted */
function sortHead<C extends string>(
  c: SortColumn<C>,
  sort: Sort<C> | undefined,
  onSort: (column: C, append: boolean) => void,
  order: string,
) {
  const label = t(c.full ?? c.label);
  const index = sort?.findIndex((l) => l.column === c.column) ?? -1;
  const level = index < 0 ? undefined : sort?.[index];
  const mark = level ? (level.desc ? 'desc' : 'asc') : '';
  const multi = level !== undefined && (sort?.length ?? 0) > 1;
  const tip = [c.icon || c.full ? label : '', t('table.sortHint', { column: label }), t('table.sortMore'), order]
    .filter((line) => line !== '')
    .join('\n');
  return html`<th class=${`sortable ${c.num ? 'num' : ''} ${c.icon ? 'icon-head' : ''} ${mark} ${multi ? 'multi' : ''}`} aria-label=${label}
    aria-sort=${mark === '' ? 'none' : mark === 'desc' ? 'descending' : 'ascending'}
    data-tip=${tip} @click=${(e: MouseEvent) => onSort(c.column, e.shiftKey)}>${c.icon ?? t(c.label)}${multi ? html`<span class="sort-level">${index + 1}</span>` : ''}</th>`;
}

/** the heads of a table row; with several levels each head's tooltip names the order */
export function sortHeads<C extends string>(
  columns: SortColumn<C>[],
  sort: Sort<C> | undefined,
  onSort: (column: C, append: boolean) => void,
) {
  const words = new Map(columns.map((c) => [c.column, t(c.full ?? c.label)]));
  const order =
    sort && sort.length > 1
      ? t('table.sortOrder', { columns: sort.map((l) => words.get(l.column)).join(t('table.sortThen')) })
      : '';
  return columns.map((c) => sortHead(c, sort, onSort, order));
}
