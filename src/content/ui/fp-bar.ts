// The thin bar under "paid in / costs", filled towards the level up (investments, GB calculator).
import { html } from 'lit-html';

/** paid in of a level in percent, 0 to 100 */
export const progressPercent = (invested: number, required: number) =>
  required > 0 ? Math.min(100, (invested / required) * 100) : 0;

export const fpBar = (percent: number) => html`<div class="fp-bar"><div style=${`width: ${percent}%`}></div></div>`;
