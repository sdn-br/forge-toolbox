// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import type { SelectionEntry } from '../src/content/core/selection';
import { selectionList } from '../src/content/ui/selection-list';

function mount(entries: SelectionEntry[]) {
  const selection = { entries: () => entries, removeName: vi.fn(), clear: vi.fn() };
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
