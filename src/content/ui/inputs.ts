// Small helpers for text inputs inside boxes.
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
