// A side panel of a box behind a tab at its edge: docked it hangs out of the box, so the content of the box keeps its
// size; popped out it takes a column beside the content. The city map shows its statistics in it, the PvP box a battle.
import { html, type TemplateResult } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';

export interface SideDrawer {
  /** class of the drawer, for the styles of one box */
  cls: string;
  open: boolean;
  /** the word on the tab */
  label: string;
  /** the tooltip of the tab, which says what a click does */
  tip: string;
  toggle(): void;
  /** the content of the open panel */
  panel: TemplateResult;
  /** width of the panel in pixels */
  width: number;
}

/**
 * Docked, the panel hangs out of the left side of the box, where the box usually has room (it opens at the right edge
 * of the screen). A box near the left edge gets it on its right side instead. Checked on every render.
 */
const place = (width: number) => (el: Element | undefined) => {
  const drawer = el as HTMLElement | undefined;
  const box = drawer?.closest('.box');
  if (!drawer || !box) return;
  drawer.dataset.side = box.getBoundingClientRect().left < width + 30 ? 'right' : 'left';
};

/** the tab and, while open, the panel; it stands beside the content of the box, in a row with it */
export const sideDrawer = (d: SideDrawer): TemplateResult =>
  html`<aside class=${d.open ? `side-drawer ${d.cls} open` : `side-drawer ${d.cls}`} style=${`--side-width: ${d.width}px`}
    ${ref(place(d.width))}>
    <button class="action side-tab" data-tip=${d.tip} @click=${() => d.toggle()}>${d.label}</button>
    ${d.open ? html`<div class="side-panel">${d.panel}</div>` : ''}
  </aside>`;
