// Tables sorted by a click on a column head: the snipe helper and both tabs of the investments.
import { html, type TemplateResult } from 'lit-html';
import { type TextKey, t } from '../core/texts';

/** a column and its direction */
export interface Sort<C extends string> {
  column: C;
  /** largest first */
  desc: boolean;
}

/** a click on a column head: the same column turns around, another starts with its natural direction */
export function nextSort<C extends string>(
  current: Sort<C> | undefined,
  column: C,
  descFirst: ReadonlySet<C>,
): Sort<C> {
  if (current?.column === column) return { column, desc: !current.desc };
  return { column, desc: descFirst.has(column) };
}

/** sorts `rows` in place by `key`; stable, so equal keys keep their order; undefined goes last in either direction */
export function sortRows<T>(rows: T[], key: (row: T) => number | string | undefined, desc: boolean): T[] {
  const sign = desc ? -1 : 1;
  return rows.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === undefined || y === undefined) return Number(x === undefined) - Number(y === undefined);
    return sign * (typeof x === 'string' ? x.localeCompare(String(y), 'de') : x - (y as number));
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

/** the head of a sortable column, marked with the direction while the rows are sorted by it */
export function sortHead<C extends string>(c: SortColumn<C>, sort: Sort<C> | undefined, onSort: (column: C) => void) {
  const label = t(c.full ?? c.label);
  const hint = t('table.sortHint', { column: label });
  const mark = sort?.column === c.column ? (sort.desc ? 'desc' : 'asc') : '';
  return html`<th class=${`sortable ${c.num ? 'num' : ''} ${c.icon ? 'icon-head' : ''} ${mark}`} aria-label=${label}
    aria-sort=${mark === '' ? 'none' : mark === 'desc' ? 'descending' : 'ascending'}
    data-tip=${c.icon || c.full ? `${label}\n${hint}` : hint} @click=${() => onSort(c.column)}>${c.icon ?? t(c.label)}</th>`;
}
