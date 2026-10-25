// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import { NameSearch, suggestNames } from '../src/content/ui/name-search';

describe('suggestNames', () => {
  const names = ['Sakura', 'Ahorn', 'Sakura', 'Kirschblüte', 'Rathaus', 'Sakura-Garten', 'Ahorn'];

  it('suggests names that contain the query, ignoring case, each once with its count', () => {
    expect(suggestNames(names, 'AHO')).toEqual([{ name: 'Ahorn', count: 2 }]);
    expect(suggestNames(names, 'rsch')).toEqual([{ name: 'Kirschblüte', count: 1 }]);
  });

  it('puts names starting with the query first, then alphabetical', () => {
    expect(suggestNames(['Wasserturm', 'Turmuhr', 'Aussichtsturm', 'Turm'], 'turm').map((s) => s.name)).toEqual([
      'Turm',
      'Turmuhr',
      'Aussichtsturm',
      'Wasserturm',
    ]);
  });

  it('suggests nothing for an empty query and cuts long lists', () => {
    expect(suggestNames(names, '  ')).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => `Haus ${String(i).padStart(2, '0')}`);
    expect(suggestNames(many, 'haus')).toHaveLength(30);
    expect(suggestNames(many, 'haus', 3).map((s) => s.name)).toEqual(['Haus 00', 'Haus 01', 'Haus 02']);
  });
});

function mount(names = ['Sakura', 'Sakura', 'Ahorn', 'Sakura-Garten']) {
  const root = document.createElement('div');
  document.body.append(root);
  const onPick = vi.fn();
  const onClear = vi.fn();
  const onInput = vi.fn();
  const search: NameSearch = new NameSearch({
    placeholder: () => 'Gebäude suchen',
    names: () => names,
    update: () => render(search.render(), root),
    onPick,
    onClear,
    onInput,
  });
  render(search.render(), root);
  const field = () => root.querySelector('input') as HTMLInputElement;
  const type = (text: string) => {
    field().value = text;
    field().dispatchEvent(new Event('input'));
  };
  const key = (k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    field().dispatchEvent(e);
    return e;
  };
  const options = () =>
    [...root.querySelectorAll('li')].map((li) =>
      [...li.querySelectorAll('span')].map((span) => span.textContent).join(' '),
    );
  const active = () => root.querySelector('li.active')?.querySelector('span')?.textContent;
  const listHidden = () => (root.querySelector('ul') as HTMLElement).hidden;
  return { root, search, field, type, key, options, active, listHidden, onPick, onClear, onInput };
}

describe('name search field', () => {
  it('lists the suggestions with their count while typing, without picking', () => {
    const s = mount();
    expect(s.listHidden()).toBe(true);
    s.type('sak');
    expect(s.options()).toEqual(['Sakura 2', 'Sakura-Garten 1']);
    expect(s.listHidden()).toBe(false);
    expect(s.field().getAttribute('aria-expanded')).toBe('true');
    expect(s.onInput).toHaveBeenCalledWith('sak');
    expect(s.onPick).not.toHaveBeenCalled();
    expect(s.onClear).not.toHaveBeenCalled();
  });

  it('moves the highlight with the arrow keys and picks it with Enter', () => {
    const s = mount();
    s.type('sak');
    expect(s.active()).toBe('Sakura');
    expect(s.key('ArrowDown').defaultPrevented).toBe(true);
    expect(s.active()).toBe('Sakura-Garten');
    s.key('ArrowDown');
    expect(s.active()).toBe('Sakura-Garten');
    // past the end the highlight stays on the last, so one step up reaches the first again
    s.key('ArrowUp');
    expect(s.active()).toBe('Sakura');
    s.key('ArrowUp');
    expect(s.active()).toBe('Sakura');
    s.key('ArrowDown');
    s.key('Enter');
    expect(s.onPick).toHaveBeenCalledWith('Sakura-Garten');
    expect(s.field().value).toBe('Sakura-Garten');
    expect(s.search.text).toBe('Sakura-Garten');
    expect(s.listHidden()).toBe(true);
  });

  it('picks a suggestion with a click', () => {
    const s = mount();
    s.type('horn');
    (s.root.querySelector('li') as HTMLElement).click();
    expect(s.onPick).toHaveBeenCalledWith('Ahorn');
    expect(s.field().value).toBe('Ahorn');
  });

  it('closes the list with Escape and opens it again with the down key', () => {
    const s = mount();
    s.type('sak');
    expect(s.key('Escape').defaultPrevented).toBe(true);
    expect(s.listHidden()).toBe(true);
    expect(s.key('Enter').defaultPrevented).toBe(false);
    expect(s.onPick).not.toHaveBeenCalled();
    s.key('ArrowDown');
    expect(s.options()).toHaveLength(2);
    // Escape on a closed list is the field's own: it empties the field
    s.key('Escape');
    expect(s.key('Escape').defaultPrevented).toBe(false);
  });

  it('reports an emptied field and suggests nothing then', () => {
    const s = mount();
    s.type('sak');
    s.type(' ');
    expect(s.onClear).toHaveBeenCalledTimes(1);
    expect(s.listHidden()).toBe(true);
    s.key('ArrowDown');
    expect(s.listHidden()).toBe(true);
  });

  it('shows nothing to pick when no name matches', () => {
    const s = mount();
    s.type('xyz');
    expect(s.listHidden()).toBe(true);
    expect(s.key('Enter').defaultPrevented).toBe(false);
    expect(s.onPick).not.toHaveBeenCalled();
  });

  it('keeps keys from the game', () => {
    const s = mount();
    const reached = vi.fn();
    document.addEventListener('keydown', reached);
    document.addEventListener('keyup', reached);
    s.key('a');
    s.key('ArrowDown');
    s.field().dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    expect(reached).not.toHaveBeenCalled();
    document.removeEventListener('keydown', reached);
    document.removeEventListener('keyup', reached);
  });

  it('closes the list when the field loses focus', () => {
    const s = mount();
    s.type('sak');
    s.field().dispatchEvent(new Event('blur'));
    expect(s.listHidden()).toBe(true);
  });
});
