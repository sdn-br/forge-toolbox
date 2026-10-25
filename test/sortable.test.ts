// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { nextSort, type Sort, type SortColumn, sortHeads, sortRows } from '../src/content/ui/sortable';

type C = 'name' | 'level' | 'cost';
const DESC_FIRST: ReadonlySet<C> = new Set(['level', 'cost']);

describe('nextSort', () => {
  it('a plain click sorts by this column only and turns the same column around', () => {
    expect(nextSort(undefined, 'name', DESC_FIRST)).toEqual([{ column: 'name', desc: false }]);
    expect(nextSort(undefined, 'level', DESC_FIRST)).toEqual([{ column: 'level', desc: true }]);
    expect(nextSort([{ column: 'name', desc: false }], 'name', DESC_FIRST)).toEqual([{ column: 'name', desc: true }]);
    expect(nextSort([{ column: 'name', desc: true }], 'level', DESC_FIRST)).toEqual([{ column: 'level', desc: true }]);
  });

  it('shift appends a column as the next level with its natural direction', () => {
    const one: Sort<C> = [{ column: 'name', desc: false }];
    const two = nextSort(one, 'level', DESC_FIRST, true);
    expect(two).toEqual([
      { column: 'name', desc: false },
      { column: 'level', desc: true },
    ]);
    expect(nextSort(two, 'cost', DESC_FIRST, true).map((l) => l.column)).toEqual(['name', 'level', 'cost']);
    expect(nextSort(undefined, 'name', DESC_FIRST, true)).toEqual([{ column: 'name', desc: false }]);
  });

  it('shift on a column of the list turns only its direction and keeps its level', () => {
    const two: Sort<C> = [
      { column: 'name', desc: false },
      { column: 'level', desc: true },
    ];
    expect(nextSort(two, 'name', DESC_FIRST, true)).toEqual([
      { column: 'name', desc: true },
      { column: 'level', desc: true },
    ]);
    expect(nextSort(two, 'level', DESC_FIRST, true)).toEqual([
      { column: 'name', desc: false },
      { column: 'level', desc: false },
    ]);
  });

  it('a plain click after several levels resets to one level on that column', () => {
    const two: Sort<C> = [
      { column: 'name', desc: false },
      { column: 'level', desc: true },
    ];
    expect(nextSort(two, 'level', DESC_FIRST)).toEqual([{ column: 'level', desc: true }]);
    expect(nextSort(two, 'cost', DESC_FIRST)).toEqual([{ column: 'cost', desc: true }]);
    expect(nextSort(two, 'name', DESC_FIRST)).toEqual([{ column: 'name', desc: false }]);
  });
});

describe('sortRows', () => {
  interface Row {
    id: number;
    group?: string;
    n?: number;
  }
  const key = (column: 'group' | 'n') => (r: Row) => r[column];
  const ids = (rows: Row[]) => rows.map((r) => r.id);

  it('compares level by level, a later level only breaks the ties of the earlier ones', () => {
    const rows: Row[] = [
      { id: 1, group: 'b', n: 1 },
      { id: 2, group: 'a', n: 1 },
      { id: 3, group: 'a', n: 9 },
      { id: 4, group: 'b', n: 5 },
    ];
    const sorted = sortRows(
      [...rows],
      [
        { column: 'group', desc: false },
        { column: 'n', desc: true },
      ],
      key,
    );
    expect(ids(sorted)).toEqual([3, 2, 4, 1]);
  });

  it('keeps the order of rows equal in every level', () => {
    const rows: Row[] = [
      { id: 1, group: 'a' },
      { id: 2, group: 'a' },
      { id: 3, group: 'a' },
    ];
    expect(ids(sortRows(rows, [{ column: 'group', desc: true }], key))).toEqual([1, 2, 3]);
  });

  it('puts an unknown value last in each level, whatever its direction', () => {
    const rows: Row[] = [
      { id: 1, group: 'a' },
      { id: 2, group: 'a', n: 3 },
      { id: 3, group: 'a', n: 7 },
      { id: 4 },
      { id: 5, group: 'b', n: 1 },
    ];
    const levels = (desc: boolean): Sort<'group' | 'n'> => [
      { column: 'group', desc },
      { column: 'n', desc },
    ];
    expect(ids(sortRows([...rows], levels(false), key))).toEqual([2, 3, 1, 5, 4]);
    expect(ids(sortRows([...rows], levels(true), key))).toEqual([5, 3, 2, 1, 4]);
  });
});

describe('sortRows, rows unknown in the same level', () => {
  it('lets the next level break the tie between two unknown values', () => {
    const rows = [
      { id: 1, n: 5 },
      { id: 2, n: 2 },
      { id: 3, g: 'a', n: 9 },
    ] as { id: number; g?: string; n: number }[];
    const sorted = sortRows(
      rows,
      [
        { column: 'g', desc: false },
        { column: 'n', desc: false },
      ],
      (column) => (r) => r[column as 'g' | 'n'],
    );
    expect(sorted.map((r) => r.id)).toEqual([3, 2, 1]);
  });
});

describe('sortHeads', () => {
  const columns: SortColumn<C>[] = [
    { column: 'name', label: 'gb.col.name', num: false },
    { column: 'level', label: 'gb.col.level', num: true },
    { column: 'cost', label: 'gb.col.cost', num: true },
  ];
  const draw = (sort: Sort<C> | undefined, onSort: (c: C, append: boolean) => void = () => {}) => {
    const root = document.createElement('tr');
    render(sortHeads(columns, sort, onSort), root);
    return [...root.querySelectorAll('th')] as HTMLElement[];
  };
  const click = (th: HTMLElement, shiftKey: boolean) =>
    th.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }));

  it('hands a plain and a shift click to the action', () => {
    const calls: [string, boolean][] = [];
    const heads = draw(undefined, (c, append) => calls.push([c, append]));
    click(heads[0] as HTMLElement, false);
    click(heads[1] as HTMLElement, true);
    expect(calls).toEqual([
      ['name', false],
      ['level', true],
    ]);
  });

  it('marks one level as today, without a number', () => {
    const [name, level] = draw([{ column: 'name', desc: false }]);
    expect(name?.className).toContain('asc');
    expect(name?.querySelector('.sort-level')).toBeNull();
    expect(name?.getAttribute('aria-sort')).toBe('ascending');
    expect(level?.getAttribute('aria-sort')).toBe('none');
  });

  it('numbers the sorted heads from two levels on, and the tooltip names the order', () => {
    const [name, level, cost] = draw([
      { column: 'level', desc: true },
      { column: 'name', desc: false },
    ]);
    expect(level?.querySelector('.sort-level')?.textContent).toBe('1');
    expect(name?.querySelector('.sort-level')?.textContent).toBe('2');
    expect(level?.className).toContain('desc');
    expect(name?.className).toContain('asc');
    expect(cost?.querySelector('.sort-level')).toBeNull();
    expect(cost?.className).not.toMatch(/asc|desc/);
    const tip = level?.getAttribute('data-tip') ?? '';
    expect(tip).toContain('Umschalt+Klick: weitere Sortierung');
    expect(tip).toContain('Sortiert nach Stufe, dann LG');
    expect(cost?.getAttribute('data-tip')).toContain('Sortiert nach Stufe, dann LG');
  });

  it('names the shift hint, but no order, for a single level', () => {
    const [name] = draw([{ column: 'name', desc: false }]);
    expect(name?.getAttribute('data-tip')).toContain('Umschalt+Klick: weitere Sortierung');
    expect(name?.getAttribute('data-tip')).toBe('Klick sortiert nach LG\nUmschalt+Klick: weitere Sortierung');
  });
});
