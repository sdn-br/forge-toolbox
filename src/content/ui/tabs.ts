// The tab bar of a box: one button per tab, the current one active (look in `.tabs`, ui/styles.ts).
import { html } from 'lit-html';

/** the current tab is disabled, a click on another one picks it */
export const tabBar = <K extends string>(
  keys: readonly K[],
  current: K,
  label: (key: K) => string,
  pick: (key: K) => void,
) =>
  html`<div class="tabs">${keys.map(
    (key) =>
      html`<button class=${key === current ? 'active' : ''} ?disabled=${key === current} @click=${() => pick(key)}>${label(key)}</button>`,
  )}</div>`;
