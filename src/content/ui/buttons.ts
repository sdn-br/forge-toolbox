// The button patterns the views repeat: an icon alone, an icon greyed while it would do nothing, and pressed toggles.
// The word is in the tooltip and the `aria-label`, never on the button.
import { html, type TemplateResult } from 'lit-html';

/** icon-only, so the label is also its accessible name; `tip` when the tooltip says more than the label */
export const iconButton = (label: string, action: (e: Event) => void, icon: TemplateResult, cls = '', tip = label) =>
  html`<button class=${cls} data-tip=${tip} aria-label=${label} @click=${action}>${icon}</button>`;

/**
 * An icon button that always keeps its place, so a bar keeps its width; while it would do nothing it is greyed and its
 * tooltip says why. aria-disabled instead of disabled: a disabled button gets no pointer events, so no tooltip.
 */
export const offButton = (on: boolean, label: string, icon: TemplateResult, action: () => void, whyOff = label) =>
  html`<button class=${on ? 'icon' : 'icon off'} aria-disabled=${on ? 'false' : 'true'} data-tip=${on ? label : whyOff}
    aria-label=${label} @click=${() => on && action()}>${icon}</button>`;

/** a toggle; `on` added to `cls` while pressed, `aria-pressed` tells the state */
export const toggleButton = (cls: string, on: boolean, word: string, icon: TemplateResult, toggle: () => void) =>
  html`<button class=${on ? `${cls} on`.trim() : cls} aria-pressed=${on ? 'true' : 'false'} data-tip=${word}
    aria-label=${word} @click=${toggle}>${icon}</button>`;

/** one icon toggle per key, in `cls`; on is highlighted */
export const toggleGroup = <K extends string>(
  cls: string,
  keys: readonly K[],
  state: Record<K, boolean>,
  word: (key: K) => string,
  icon: (key: K) => TemplateResult,
  set: (state: Record<K, boolean>) => void,
) =>
  html`<span class=${`icon-toggles ${cls}`}>${keys.map((key) =>
    toggleButton('', state[key], word(key), icon(key), () => set({ ...state, [key]: !state[key] })),
  )}</span>`;

/** a single icon toggle in `cls`, looking like those of a group */
export const filterToggle = (
  cls: string,
  on: boolean,
  word: string,
  icon: TemplateResult,
  set: (on: boolean) => void,
) => html`<span class=${`icon-toggles ${cls}`}>${toggleButton('', on, word, icon, () => set(!on))}</span>`;
