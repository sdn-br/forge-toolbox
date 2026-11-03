// The tab bar of a box: one button per tab, the current one active (look in `.tabs`, ui/styles.ts).
import { html, type TemplateResult } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';

/**
 * The current tab is disabled, a click on another one picks it. A tab that shows an icon passes `tip`: the word in the
 * tooltip and the `aria-label`.
 */
export const tabBar = <K extends string>(
  keys: readonly K[],
  current: K,
  label: (key: K) => string | TemplateResult,
  pick: (key: K) => void,
  tip?: (key: K) => string,
) =>
  html`<div class="tabs">${keys.map(
    (key) =>
      html`<button class=${key === current ? 'active' : ''} ?disabled=${key === current} data-tip=${ifDefined(tip?.(key))}
        aria-label=${ifDefined(tip?.(key))} @click=${() => pick(key)}>${label(key)}</button>`,
  )}</div>`;
