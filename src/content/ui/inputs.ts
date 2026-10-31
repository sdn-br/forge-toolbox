// Small helpers for text inputs inside boxes.
import { html } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';

const focused = new WeakSet<Element>();

/** Focuses and selects an input once, when it first shows; later renders leave focus alone. */
export const autofocus = ref((el) => {
  if (!(el instanceof HTMLElement) || focused.has(el)) return;
  focused.add(el);
  // the element is not in the document yet while lit-html commits the template
  queueMicrotask(() => {
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  });
});

/** Keys typed into the toolbox are not meant for the game, which listens on the document. */
export const keepKeys = (e: KeyboardEvent) => e.stopPropagation();

/** a search field that reports each change; the label is its placeholder and accessible name */
export const searchField = (value: string, label: string, set: (value: string) => void) =>
  html`<input type="search" placeholder=${label} aria-label=${label} .value=${value}
    @input=${(e: Event) => set((e.target as HTMLInputElement).value)}
    @keydown=${keepKeys} @keypress=${keepKeys} @keyup=${keepKeys} />`;
