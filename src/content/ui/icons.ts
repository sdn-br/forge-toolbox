// All toolbox icons on one 24x24 grid, drawn with the current colour. Parts of the class "acc" take the accent colour
// (see baseCss); cut-outs fill with var(--btn), the colour of the button behind the icon.
import { html, svg, type TemplateResult } from 'lit-html';

/** the line width of menu icons and of the small header icons; the only place the width is set */
const MENU_STROKE = 1.8;
const HEADER_STROKE = 2.4;

const frame = (inner: TemplateResult, strokeWidth: number) =>
  html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${strokeWidth}
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const menuIcon = (inner: TemplateResult) => frame(inner, MENU_STROKE);
const headerIcon = (inner: TemplateResult) => frame(inner, HEADER_STROKE);

// traced from the game's great building icon: a tall keep left of centre, a lower tower on the right,
// in front a wall with a battlement band and a square gate; filled, windows and gate cut out
const castleShape = svg`<g fill="currentColor" stroke="none" fill-rule="evenodd">
    <path class="acc" d="M3.8 2.5H5.3V3.5H6.5V2.5H7.9V3.5H9.1V2.5H10.5V3.5H11.7V2.5H13.2V5H3.8Z"/>
    <path d="M5.6 5.5H11.7V11.9H5.6Z M7.1 6.8V8.3H10.1V6.8Z M7.1 9.4V10.8H10.1V9.4Z"/>
    <path d="M2 12.4H14.6V15.3H2Z M4.1 13.1V15.3H4.7V13.1Z M6.7 13.1V15.3H7.3V13.1Z M9.3 13.1V15.3H9.9V13.1Z M11.9 13.1V15.3H12.5V13.1Z"/>
    <path d="M3.1 15.8H14.6V21.6H12.1V18.2H7.6V21.6H3.1Z"/>
    <path class="acc" d="M14.1 7.2H16V8.2H17.2V7.2H18.8V8.2H20V7.2H22V9.7H14.1Z"/>
    <path d="M15.1 10.2H20V21.6H15.1Z M16.4 11.4V12.8H18.6V11.4Z M16.4 13.6V15H18.6V13.6Z M16.4 15.8V17.2H18.6V15.8Z"/>
  </g>`;
const castle = (scale = 1, tx = 0, ty = 0) =>
  svg`<g transform="translate(${tx} ${ty}) scale(${scale})">${castleShape}</g>`;

const brokenShield = svg`<path transform="translate(-1.3 .5) rotate(-4 8 12)" d="M12 3 5 5.6v5.6c0 4.4 3 7.8 7 9.8l.6-3.5-1.4-3.5 1.8-3.5-2-3.5Z"/>
    <path class="acc" transform="translate(1.3 -.3) rotate(4 16 12)" d="M12 3l7 2.6v5.6c0 4.4-3 7.8-7 9.8l.6-3.5-1.4-3.5 1.8-3.5-2-3.5Z"/>`;

/** a gear outline: n trapezoid teeth on a round rim */
const gearPath = (n = 8, ro = 10.2, rr = 7.6, c = 12) => {
  const p = (2 * Math.PI) / n;
  const tt = p * 0.16;
  const tb = p * 0.26;
  const pt = (r: number, a: number) => `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i * p;
    d += `${i ? 'L' : 'M'}${pt(rr, a - tb)}L${pt(ro, a - tt)}L${pt(ro, a + tt)}L${pt(rr, a + tb)}`;
    d += `A${rr} ${rr} 0 0 1 ${pt(rr, a + p - tb)}`;
  }
  return `${d}Z`;
};

// a feather drawn pointing up with the nib at 0 0: wider vane on the left, two cuts in the barbs, the shaft through it
const vane =
  'M0 -5.4C-1.5 -7.2 -3 -10.8 -2.6 -13.4L-1.6 -12.8L-2.2 -15.1C-1.9 -16.8 -.8 -18 .3 -18.2C2 -15.6 2.2 -11.4 1.6 -9.6L.9 -10.2L1.2 -8.4C.9 -7 .4 -6 0 -5.4Z';
const featherFilled = svg`<g transform="translate(11.4 19.1) rotate(38.6)" stroke-width="1.2">
    <path class="acc" d="${vane}" fill="currentColor"/>
    <path d="M0 0V-5.4"/><path d="M0 -5.4V-16.2" stroke="var(--btn)" stroke-width=".8"/>
  </g>`;
// a little smaller and lower left than the plain scroll, so the feather can reach past its top edge
const scroll20 = svg`<g transform="translate(-2.2 1.6) rotate(-20 12 12) translate(12 12) scale(.9) translate(-12 -12)">
    <path d="M8 6.5V18a2.5 2.5 0 0 1-2.5 2.5H15a2.5 2.5 0 0 0 2.5-2.5V7.5"/>
    <path d="M8 6.5a3 3 0 0 1 3-3h7.5a2 2 0 0 1 0 4H8"/>
    <path d="M5.5 20.5a2.5 2.5 0 0 1 0-5H8"/>
    <path d="M10.8 11h4M10.8 14h2"/></g>`;

const sword = (angle: number) => svg`<g transform="rotate(${angle} 12 12)" stroke-width="1.4">
    <path d="M12 .6l1.4 2.2v13.6h-2.8V2.8Z" fill="var(--btn)"/>
    <path d="M12 4v11" stroke-width=".8"/>
    <rect class="acc" x="8.4" y="16.4" width="7.2" height="1.7" rx=".8" fill="currentColor"/>
    <path d="M12 18.4v2.8" stroke-width="1.9"/>
    <circle class="acc" cx="12" cy="22.3" r="1.1" fill="currentColor"/>
  </g>`;

const foldedMap = svg`<path d="M3 6.2 9 4l6 2.2L21 4v13.8L15 20l-6-2.2L3 20Z"/><path d="M9 4v13.8M15 6.2V20"/>`;

/** the icons of the menu, the settings sidebar and the features, one per menu entry */
export const icons = {
  /** a gear, the hub in the accent */
  settings: menuIcon(svg`<path d="${gearPath()}"/><circle class="acc" cx="12" cy="12" r="3.2"/>`),
  /** the shield split along a jagged line, both halves pushed apart */
  sabotage: menuIcon(brokenShield),
  /** the folded map shrunk to the upper left, a magnifier bottom right */
  cityMap: menuIcon(svg`<g transform="scale(.82)">${foldedMap}</g>
    <circle class="acc" cx="15.2" cy="14.8" r="4.1" fill="var(--btn)"/><path class="acc" d="m18.1 17.7 3.8 3.8" stroke-width="2.2"/>
    <path d="M13.2 13.9a2.2 2.2 0 0 1 1.8-1.8" stroke-width="1.2"/>`),
  pvp: menuIcon(svg`${sword(45)}${sword(-45)}`),
  notes: menuIcon(svg`${scroll20}${featherFilled}`),
  /** the calculator signs large, the castle small in the fourth cell of the 2x2 grid */
  gbCalculator: menuIcon(svg`<rect x="2.2" y="2" width="17" height="19.5" rx="2.2"/>
    <path class="acc" d="M4.8 7.6h4.2M6.9 5.5v4.2M12.6 7.6h4.2M5.3 12.6l3.2 3.2M8.5 12.6l-3.2 3.2" stroke-width="1.6"/>
    <rect x="11.1" y="11.4" width="14" height="14" rx="2" fill="var(--btn)" stroke="none"/>${castle(0.56, 10.9, 10.9)}`),
  /** the castle over a progress bar, the filled part is the own share (temporary: the box moves into the calculator) */
  gbOwnShare: menuIcon(svg`${castle(0.82, 2.2, 0)}
    <rect x="3" y="19.2" width="18" height="3.2" rx="1"/>
    <rect class="acc" x="3" y="19.2" width="7.5" height="3.2" rx="1" fill="currentColor"/>`),
};

/** the icons of the box header */
export const headerIcons = {
  gear: headerIcon(svg`<path d="${gearPath()}"/><circle cx="12" cy="12" r="3.2"/>`),
  /** loose: a tilted outline; pinned: upright and filled */
  pin: (pinned: boolean): TemplateResult =>
    headerIcon(svg`<g transform=${pinned ? '' : 'rotate(40 12 12)'} fill=${pinned ? 'currentColor' : 'none'}>
    <path d="M7.5 2.5h9M9.2 2.5v7.2L5.5 14h13l-3.7-4.3V2.5"/><path d="M12 14v8"/></g>`),
  popout: headerIcon(
    svg`<path d="M14 3.5h6.5V10M20.5 3.5 12 12"/><path d="M18.5 14v4.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2H10"/>`,
  ),
  minimize: headerIcon(svg`<path d="M5 19h14"/>`),
  close: headerIcon(svg`<path d="M6 6l12 12M18 6 6 18"/>`),
};
