// @vitest-environment happy-dom
import { render } from 'lit-html';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteEditor, SAVE_DELAY } from '../src/content/ui/note-editor';

function setup(initial = '**hello**') {
  const container = document.createElement('div');
  document.body.append(container);
  const store = { text: initial, key: 'a' };
  const saves: [string, string][] = [];
  const editor: NoteEditor = new NoteEditor(() => draw());
  const draw = () => {
    const key = store.key;
    render(
      editor.render({ key, text: store.text, placeholder: 'empty', save: (text) => saves.push([key, text]) }),
      container,
    );
  };
  draw();
  const textarea = () => container.querySelector('textarea');
  const type = (text: string) => {
    const el = textarea() as HTMLTextAreaElement;
    el.value = text;
    el.dispatchEvent(new Event('input'));
  };
  return { container, store, saves, editor, draw, textarea, type };
}

const flush = () => new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('NoteEditor', () => {
  it('shows the rendered note and the placeholder when empty', () => {
    expect(setup().container.querySelector('strong')?.textContent).toBe('hello');
    expect(setup('  ').container.textContent?.trim()).toBe('empty');
  });

  it('switches to the source on click and focuses it', async () => {
    const { container, textarea } = setup();
    (container.querySelector('.note') as HTMLElement).click();
    expect(textarea()?.value).toBe('**hello**');
    await flush();
    expect(document.activeElement).toBe(textarea());
  });

  it('does not start editing when a link is clicked', () => {
    const { container, textarea } = setup('[x](https://example.org)');
    container.querySelector('a')?.addEventListener('click', (e) => e.preventDefault());
    container.querySelector('a')?.click();
    expect(textarea()).toBeNull();
  });

  it('saves after the last keystroke and not the same text twice', () => {
    vi.useFakeTimers();
    const { container, saves, type } = setup();
    (container.querySelector('.note') as HTMLElement).click();
    type('a');
    vi.advanceTimersByTime(SAVE_DELAY - 1);
    type('ab');
    vi.advanceTimersByTime(SAVE_DELAY - 1);
    expect(saves).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(saves).toEqual([['a', 'ab']]);
    type('ab');
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(saves).toHaveLength(1);
  });

  it('saves on blur and shows the rendered note again', () => {
    const { container, saves, store, textarea, type } = setup();
    (container.querySelector('.note') as HTMLElement).click();
    type('*new*');
    store.text = '*new*';
    textarea()?.dispatchEvent(new Event('blur'));
    expect(saves).toEqual([['a', '*new*']]);
    expect(textarea()).toBeNull();
    expect(container.querySelector('em')?.textContent).toBe('new');
  });

  it('does not save when nothing changed', () => {
    const { container, saves, textarea } = setup();
    (container.querySelector('.note') as HTMLElement).click();
    textarea()?.dispatchEvent(new Event('blur'));
    expect(saves).toEqual([]);
  });

  it('keeps what the user types when the stored text changes meanwhile', async () => {
    const { container, store, draw, textarea, type } = setup();
    (container.querySelector('.note') as HTMLElement).click();
    await flush();
    const el = textarea() as HTMLTextAreaElement;
    type('typed');
    el.setSelectionRange(2, 2);
    store.text = 'changed elsewhere';
    draw();
    expect(textarea()).toBe(el);
    expect(el.value).toBe('typed');
    expect(el.selectionStart).toBe(2);
    expect(document.activeElement).toBe(el);
  });

  it('saves the open note to its own target when another note is shown', () => {
    const { container, saves, store, draw, textarea, type } = setup();
    (container.querySelector('.note') as HTMLElement).click();
    type('for a');
    store.key = 'b';
    store.text = 'b text';
    draw();
    expect(saves).toEqual([['a', 'for a']]);
    expect(textarea()).toBeNull();
    expect(container.textContent).toContain('b text');
  });

  it('opens a note for typing from outside', async () => {
    const { editor, textarea } = setup();
    editor.edit('a');
    expect(textarea()?.value).toBe('**hello**');
    await flush();
    expect(document.activeElement).toBe(textarea());
  });
});
