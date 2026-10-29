// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import type { Footprint } from '../src/content/domain/city-grid';
import { groupSelection, type SelectionEntry, selectionList } from '../src/content/ui/selection-list';

function mount(entries: SelectionEntry[]) {
  // per entry `total` buildings of that name on the grid, the first `selected` of them selected
  const buildings: Footprint[] = [];
  const ids = new Set<number>();
  for (const { name, selected, total } of entries)
    for (let i = 0; i < total; i++) {
      const id = buildings.length + 1;
      buildings.push({ building: { id }, def: { name } } as Footprint);
      if (i < selected) ids.add(id);
    }
  const selection = { buildings: () => buildings, ids: () => ids, removeName: vi.fn(), clear: vi.fn() };
  const root = document.createElement('div');
  render(selectionList(selection), root);
  const rows = () =>
    [...root.querySelectorAll('.selection-list li')].map((li) =>
      [...li.querySelectorAll('span')].map((s) => s.textContent).join(' '),
    );
  const button = (label: string) => {
    const b = [...root.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === label);
    if (!b) throw new Error(`no button "${label}"`);
    return b;
  };
  return { root, rows, button, selection };
}

describe('selection list', () => {
  it('shows one entry per name with selected and existing buildings', () => {
    const s = mount([
      { name: 'Aachener Dom', selected: 1, total: 1 },
      { name: 'Domizil', selected: 3, total: 12 },
    ]);
    expect(s.rows()).toEqual(['Aachener Dom 1/1', 'Domizil 3/12']);
    // icons, the word in tooltip and label
    const remove = s.button('Domizil entfernen');
    expect(remove.dataset.tip).toBe('Entfernen');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(s.button('Alle entfernen').dataset.tip).toBe('Alle entfernen');
  });

  it('removes the buildings of one name with its ✕, and all with the button below', () => {
    const s = mount([
      { name: 'Aachener Dom', selected: 1, total: 1 },
      { name: 'Domizil', selected: 3, total: 12 },
    ]);
    s.button('Domizil entfernen').click();
    expect(s.selection.removeName).toHaveBeenCalledWith('Domizil');
    s.button('Alle entfernen').click();
    expect(s.selection.clear).toHaveBeenCalledTimes(1);
  });

  it('says so when nothing is selected, without buttons', () => {
    const s = mount([]);
    expect(s.root.querySelector('p.muted')?.textContent).toContain('Nichts ausgewählt');
    expect(s.root.querySelector('button')).toBeNull();
  });
});

describe('groupSelection', () => {
  it('groups the selected buildings by name with the count of that name, sorted by name', () => {
    const buildings = [
      { id: 1, name: 'Domizil' },
      { id: 2, name: 'Domizil' },
      { id: 3, name: 'Aachener Dom' },
      { id: 4, name: 'Bauernhof' },
      { id: 5, name: 'Domizil' },
    ];
    expect(groupSelection(buildings, new Set([2, 3, 5]))).toEqual([
      { name: 'Aachener Dom', selected: 1, total: 1 },
      { name: 'Domizil', selected: 2, total: 3 },
    ]);
    expect(groupSelection(buildings, new Set())).toEqual([]);
  });
});
