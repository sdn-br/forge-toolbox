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

// "FoE" set in MedievalSharp (SIL Open Font License), converted to a path so no font has to load
const FOE_PATH =
  'M8.44 15.58L8.44 15.58Q8.64 15.66 8.83 15.70Q9.02 15.74 9.25 15.74L9.25 15.74Q9.66 15.74 10.15 15.58L10.15 15.58Q9.92 15.99 9.90 16.37L9.90 16.37Q9.60 16.35 9.36 16.27Q9.12 16.19 8.93 16.05L8.93 16.05Q8.72 15.89 8.60 15.78Q8.48 15.67 8.43 15.61L8.43 15.61Q8.37 16.05 8.33 16.57Q8.30 17.09 8.30 17.71L8.30 17.71L8.30 17.76Q9.16 17.72 9.77 17.41L9.77 17.41Q9.70 17.54 9.65 17.75Q9.59 17.95 9.57 18.20L9.57 18.20L9.48 18.17Q9.31 18.12 9.02 18.09Q8.74 18.06 8.35 18.07L8.35 18.07L8.30 18.07Q8.31 18.74 8.34 19.20Q8.36 19.66 8.42 19.90L8.42 19.90L8.44 20.01Q8.31 20.03 8.19 20.06Q8.07 20.09 7.96 20.13Q7.86 20.18 7.78 20.22Q7.70 20.26 7.65 20.30L7.65 20.30Q7.72 19.83 7.75 19.31Q7.79 18.79 7.79 18.20L7.79 18.20Q7.78 17.37 7.75 16.81Q7.72 16.25 7.67 15.96L7.67 15.96L7.65 15.86Q7.84 15.83 8.03 15.77Q8.22 15.70 8.44 15.58ZM11.12 17.23L11.12 17.23L11.12 17.23Q11.03 17.40 10.93 17.79L10.93 17.79Q10.85 18.08 10.85 18.32L10.85 18.32Q10.85 18.42 10.87 18.53L10.87 18.53Q10.91 18.80 11.10 19.09L11.10 19.09Q11.30 19.38 11.64 19.54L11.64 19.54Q11.96 19.69 12.56 19.82L12.56 19.82L12.57 19.82Q12.64 19.65 12.74 19.20L12.74 19.20Q12.81 18.93 12.81 18.71L12.81 18.71Q12.81 18.59 12.79 18.50L12.79 18.50Q12.74 18.23 12.56 17.94L12.56 17.94Q12.41 17.71 12.02 17.49L12.02 17.49Q11.71 17.32 11.12 17.23ZM12.60 19.87L11.89 20.31Q11.70 20.27 11.44 20.13L11.44 20.13Q11.19 20.00 10.97 19.79L10.97 19.79Q10.70 19.53 10.59 19.21L10.59 19.21Q10.46 18.89 10.46 18.56L10.46 18.56Q10.46 18.55 10.46 18.54L10.46 18.54Q10.46 18.21 10.61 17.85L10.61 17.85Q10.73 17.57 10.92 17.37L10.92 17.37Q11.01 17.27 11.11 17.20L11.11 17.20L11.77 16.77Q11.92 16.81 12.22 16.96L12.22 16.96Q12.43 17.07 12.68 17.29L12.68 17.29Q12.96 17.56 13.07 17.89L13.07 17.89Q13.20 18.24 13.20 18.54L13.20 18.54L13.20 18.55Q13.20 18.98 13.06 19.24L13.06 19.24Q12.85 19.63 12.71 19.76L12.71 19.76Q12.63 19.82 12.60 19.87L12.60 19.87ZM15.13 20.17L15.13 20.17Q14.60 20.17 13.98 20.30L13.98 20.30Q14.05 19.84 14.08 19.32Q14.11 18.80 14.11 18.21L14.11 18.21Q14.11 17.36 14.08 16.80Q14.05 16.24 14.00 15.96L14.00 15.96L13.98 15.86Q14.17 15.83 14.36 15.77Q14.55 15.70 14.77 15.58L14.77 15.58Q14.96 15.64 15.15 15.69Q15.34 15.74 15.58 15.74L15.58 15.74Q15.99 15.74 16.47 15.58L16.47 15.58Q16.25 15.99 16.22 16.37L16.22 16.37Q15.64 16.33 15.25 16.05L15.25 16.05Q15.07 15.91 14.94 15.80Q14.82 15.70 14.76 15.64L14.76 15.64Q14.62 16.50 14.62 17.71L14.62 17.71L14.62 17.76Q15.49 17.72 16.10 17.41L16.10 17.41Q16.04 17.53 15.98 17.73Q15.92 17.94 15.89 18.20L15.89 18.20L15.81 18.17Q15.45 18.07 14.75 18.07L14.75 18.07L14.63 18.07Q14.64 19.35 14.73 19.85L14.73 19.85Q14.82 19.87 14.88 19.87L14.88 19.87Q15.95 19.87 16.66 19.51L16.66 19.51Q16.60 19.62 16.54 19.81Q16.48 19.99 16.45 20.30L16.45 20.30L16.37 20.28Q16.03 20.17 15.13 20.17Z';
const foeLettering = svg`<path d=${FOE_PATH} fill="currentColor" stroke="none"/>`;

/** the handle of the collapsed menu: an open tool box, hammer, screwdriver and wrench sticking out, "FoE" on the front */
export const toolboxIcon = menuIcon(svg`<path d="M17.2 11V5"/>
  <rect class="acc" x="14.4" y="2.8" width="5.6" height="2.2" rx=".5" fill="currentColor" stroke="none"/>
  <path d="M11.8 11V4.6M11 4.6h1.6" stroke-width="1.3"/>
  <path d="M6.2 11 7.2 7"/><path class="acc" d="M8.8 3a2.1 2.1 0 1 0 .7 3.2" stroke-width="1.6"/>
  <rect x="2.5" y="11" width="19" height="10.5" rx="1.5" fill="var(--btn)"/><path d="M2.5 13.8h19"/>${foeLettering}`);

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
  /** the castle small, beside it in the accent the FP coin of the game: rim and stamp */
  investments: menuIcon(svg`${castle(0.78, 0, 5.2)}
    <g class="acc"><circle cx="18" cy="6.5" r="4.6"/><circle cx="18" cy="6.5" r="2" stroke-width="1.4"/></g>`),
};

const FORWARD = 'M20 12a8 8 0 1 1-2.3-5.6';
const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9Z';

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
  /** a diskette: save */
  save: headerIcon(
    svg`<path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5Z"/><path d="M8 3.5v5h7v-5"/><path d="M7.5 20.5v-6h9v6"/>`,
  ),
  /** an arrow turning back counter-clockwise: reset */
  reset: headerIcon(svg`<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4.5h4.5"/>`),
  /** the great building castle: values of this building only, beside the checked arrow of the standard */
  castle: headerIcon(castleShape),
  /** a pencil: changed, not saved */
  pencil: headerIcon(
    svg`<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19Z"/><path d="M13.5 7l3.5 3.5"/>`,
  ),
  /** a five-pointed star: remember a building or a player */
  star: headerIcon(svg`<path d="${STAR}"/>`),
  /** the star filled: remembered */
  starFilled: headerIcon(svg`<path d="${STAR}" fill="currentColor"/>`),
  /** the reset arrow mirrored, turning clockwise: make it the standard */
  adopt: headerIcon(svg`<path d="${FORWARD}"/><path d="M20 4v4.5h-4.5"/>`),
  /** the same arrow with an accent check inside: the standard applies */
  adopted: headerIcon(svg`<path d="${FORWARD}"/><path class="acc" d="M8.6 12.2l2.4 2.4 4.4-4.6"/>`),
  /** head and shoulders: a player */
  person: headerIcon(svg`<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4.2 3.3-6.8 7.5-6.8s7.5 2.6 7.5 6.8"/>`),
  /** the motifs of the game's social bar: a gabled house with a smaller one behind, a neighbour */
  neighbor: headerIcon(
    svg`<path d="M2.5 13 8.5 7.5l6 5.5"/><path d="M4.2 11.8V20.5h8.6v-8.7"/><path d="M7.3 20.5v-4h2.4v4"/><path d="M12.8 9.2 16.6 6l4.6 4"/><path d="M19.8 9v11.5h-7"/>`,
  ),
  /** two people, the one behind a bit higher: a friend */
  friend: headerIcon(
    svg`<circle cx="8.3" cy="7" r="3"/><path d="M2.5 18.5c0-3.6 2.4-6 5.8-6 1 0 1.9.2 2.7.6"/><circle cx="15.6" cy="10" r="3.2"/><path d="M9.6 21.5c0-3.6 2.6-6 6-6s6 2.4 6 6"/>`,
  ),
  /** the whole heraldic shield: a guild member (the sabotage shield is broken in two) */
  guild: headerIcon(svg`<path d="M5 4h14v7.2c0 4.6-3 7.8-7 9.3-4-1.5-7-4.7-7-9.3Z"/>`),
  /** a clock: a promised payment, not paid yet */
  clock: headerIcon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>`),
  /** a warning triangle: danger */
  warning: headerIcon(svg`<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.4M12 17.2v.3"/>`),
  /** an arrow up: the payment levels the building */
  arrowUp: headerIcon(svg`<path d="M12 20V4.5M5.5 11 12 4.5 18.5 11"/>`),
  /** a small castle, », a big castle: power leveling, the building grows fast; wider than the grid, both castles
   * centred on the tip of the chevrons, the big one at full height, equal space on both sides of the chevrons */
  powerLevel: html`<svg class="wide" viewBox="0 0 61.72 24" fill="none" aria-hidden="true">
    ${castle(0.816, -1.13, 2.17)}${castle(1.2, 34.82, -2.46)}
    <path fill="currentColor" d="M20.72 8H23.52L27.92 12L23.52 16H20.72L25.12 12Z M26.12 8H28.92L33.32 12L28.92 16H26.12L30.52 12Z"/></svg>`,
  /** two sheets, one over the other: copy */
  copy: headerIcon(
    svg`<rect x="8.5" y="8.5" width="12" height="12" rx="1.8"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>`,
  ),
  /** the letter i in a circle: a hint */
  info: headerIcon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>`),
  /** a plus over a minus: the difference, plus or minus */
  plusMinus: headerIcon(svg`<path d="M12 3.5v10M7 8.5h10M7 19.5h10"/>`),
  /** a heap of coin stacks with "2×" in front: the double harvest. Its own frame and line widths; the stacks fill with
   * var(--bg), the colour behind the icon, so the back ones hide behind the front ones; "2×" gets a rim of it */
  doubleHarvest: html`<svg class="harvest" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g transform="translate(3.04 6.00) scale(0.75)"><path style="fill:var(--bg)" d="M9.5 -5.5V19A3.0 1.5 0 0 0 15.5 19V-5.5Z"/>
    <ellipse style="fill:var(--bg)" cx="12.5" cy="-5.5" rx="3.0" ry="1.5"/>
    <path stroke-width="0.87" d="M9.5 -3.10A3.0 1.5 0 0 0 15.5 -3.10"/>
    <path stroke-width="0.87" d="M9.5 -0.70A3.0 1.5 0 0 0 15.5 -0.70"/>
    <path stroke-width="0.87" d="M9.5 1.70A3.0 1.5 0 0 0 15.5 1.70"/>
    <path stroke-width="0.87" d="M9.5 4.10A3.0 1.5 0 0 0 15.5 4.10"/>
    <path stroke-width="0.87" d="M9.5 6.50A3.0 1.5 0 0 0 15.5 6.50"/>
    <path stroke-width="0.87" d="M9.5 8.90A3.0 1.5 0 0 0 15.5 8.90"/>
    <path stroke-width="0.87" d="M9.5 11.30A3.0 1.5 0 0 0 15.5 11.30"/>
    <path stroke-width="0.87" d="M9.5 13.70A3.0 1.5 0 0 0 15.5 13.70"/>
    <path stroke-width="0.87" d="M9.5 16.10A3.0 1.5 0 0 0 15.5 16.10"/>
    <path style="fill:var(--bg)" d="M3.4 6.8V20.5A3.05 1.6 0 0 0 9.5 20.5V6.8Z"/>
    <ellipse style="fill:var(--bg)" cx="6.45" cy="6.8" rx="3.05" ry="1.6"/>
    <path stroke-width="0.87" d="M3.4 9.20A3.05 1.6 0 0 0 9.5 9.20"/>
    <path stroke-width="0.87" d="M3.4 11.60A3.05 1.6 0 0 0 9.5 11.60"/>
    <path stroke-width="0.87" d="M3.4 14.00A3.05 1.6 0 0 0 9.5 14.00"/>
    <path stroke-width="0.87" d="M3.4 16.40A3.05 1.6 0 0 0 9.5 16.40"/>
    <path stroke-width="0.87" d="M3.4 18.80A3.05 1.6 0 0 0 9.5 18.80"/>
    <path style="fill:var(--bg)" d="M14.5 4.6V20A3.25 1.6 0 0 0 21 20V4.6Z"/>
    <ellipse style="fill:var(--bg)" cx="17.75" cy="4.6" rx="3.25" ry="1.6"/>
    <path stroke-width="0.87" d="M14.5 7.00A3.25 1.6 0 0 0 21 7.00"/>
    <path stroke-width="0.87" d="M14.5 9.40A3.25 1.6 0 0 0 21 9.40"/>
    <path stroke-width="0.87" d="M14.5 11.80A3.25 1.6 0 0 0 21 11.80"/>
    <path stroke-width="0.87" d="M14.5 14.20A3.25 1.6 0 0 0 21 14.20"/>
    <path stroke-width="0.87" d="M14.5 16.60A3.25 1.6 0 0 0 21 16.60"/>
    <path stroke-width="0.87" d="M14.5 19.00A3.25 1.6 0 0 0 21 19.00"/>
    <path style="fill:var(--bg)" d="M0.7 15.2V21.6A2.3 1.3 0 0 0 5.3 21.6V15.2Z"/>
    <ellipse style="fill:var(--bg)" cx="3.0" cy="15.2" rx="2.3" ry="1.3"/>
    <path stroke-width="0.87" d="M0.7 16.80A2.3 1.3 0 0 0 5.3 16.80"/>
    <path stroke-width="0.87" d="M0.7 18.40A2.3 1.3 0 0 0 5.3 18.40"/>
    <path stroke-width="0.87" d="M0.7 20.00A2.3 1.3 0 0 0 5.3 20.00"/>
    <path style="fill:var(--bg)" d="M18.6 16.8V21.6A2.3 1.3 0 0 0 23.2 21.6V16.8Z"/>
    <ellipse style="fill:var(--bg)" cx="20.9" cy="16.8" rx="2.3" ry="1.3"/>
    <path stroke-width="0.87" d="M18.6 18.40A2.3 1.3 0 0 0 23.2 18.40"/>
    <path stroke-width="0.87" d="M18.6 20.00A2.3 1.3 0 0 0 23.2 20.00"/>
    <path style="fill:var(--bg)" d="M7.5 12.5V21A4.5 1.7 0 0 0 16.5 21V12.5Z"/>
    <ellipse style="fill:var(--bg)" cx="12.0" cy="12.5" rx="4.5" ry="1.7"/>
    <path stroke-width="0.87" d="M7.5 14.90A4.5 1.7 0 0 0 16.5 14.90"/>
    <path stroke-width="0.87" d="M7.5 17.30A4.5 1.7 0 0 0 16.5 17.30"/>
    <path stroke-width="0.87" d="M7.5 19.70A4.5 1.7 0 0 0 16.5 19.70"/>
    </g>
    <text x="12" y="19.7" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="7.8" style="fill:var(--accent);stroke:var(--bg);stroke-width:2.6px;paint-order:stroke;stroke-linejoin:round">2×</text></svg>`,
  /** a check mark: done */
  check: headerIcon(svg`<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>`),
  /** a check mark in a circle: safe */
  checkCircle: headerIcon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.2 9.5"/>`),
  /** a question mark in a circle: possible, not certain */
  questionCircle: headerIcon(
    svg`<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.7a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 16.6v.2"/>`,
  ),
  /** the folded map: open the map */
  map: headerIcon(foldedMap),
  /** a sheet with a folded corner and two lines: a note */
  note: headerIcon(
    svg`<path d="M6 3.5h8.5L19 8v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path d="M14.5 3.5V8H19"/><path d="M8.5 13h7M8.5 16.5h5"/>`,
  ),
  /** a chevron pointing left: previous page */
  chevronLeft: headerIcon(svg`<path d="M15 5 8 12l7 7"/>`),
  /** a chevron pointing right: next page, or a closed section */
  chevronRight: headerIcon(svg`<path d="m9 5 7 7-7 7"/>`),
  /** a chevron pointing up: scroll up */
  chevronUp: headerIcon(svg`<path d="m5 15 7-7 7 7"/>`),
  /** a chevron pointing down: an open section, a click closes it */
  chevronDown: headerIcon(svg`<path d="m5 9 7 7 7-7"/>`),
  /** a trash can: delete */
  trash: headerIcon(
    svg`<path d="M4 6.5h16M9.5 6.5V4h5v2.5"/><path d="M6 6.5l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-13"/><path d="M10 10.5v6M14 10.5v6"/>`,
  ),
  /** head and shoulders with a plus: add a player */
  personPlus: headerIcon(
    svg`<circle cx="9.5" cy="8" r="3.4"/><path d="M2.5 20.5c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/><path d="M19 6.5v6M16 9.5h6"/>`,
  ),
  /** a sheet with a folded corner and a plus: add a page */
  notePlus: headerIcon(
    svg`<path d="M6 3.5h8.5L19 8v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path d="M14.5 3.5V8H19"/><path d="M12 11v6.5M8.8 14.2h6.4"/>`,
  ),
  /** an arrow down into a tray: save as a file */
  download: headerIcon(
    svg`<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>`,
  ),
  /** a plus: add, zoom in */
  plus: headerIcon(svg`<path d="M12 5v14M5 12h14"/>`),
  /** a minus: zoom out */
  minus: headerIcon(svg`<path d="M5 12h14"/>`),
  /** four corner brackets pointing out: fit the whole */
  fit: headerIcon(svg`<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>`),
  /** a circle with a slash: nothing to get here */
  noReward: headerIcon(svg`<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>`),
  /** the FP coin, three arrows rising in the accent cut into it: profit */
  profit:
    headerIcon(svg`<circle cx="8.6" cy="9.6" r="6.4" stroke-width="2"/><circle cx="8.6" cy="9.6" r="2.56" stroke-width="1.4"/>
    <g class="acc" fill="currentColor" stroke="var(--btn)" stroke-width="1.4" stroke-linejoin="miter" paint-order="stroke">
      <path d="M11.6 21V16H10.8L12.6 13.2L14.4 16H13.6V21Z"/><path d="M15.6 21V12.4H14.8L16.6 9.6L18.4 12.4H17.6V21Z"/>
      <path d="M19.6 21V8.4H18.8L20.6 5.6L22.4 8.4H21.6V21Z"/></g>`),
  /** the person struck through, the stroke cut out of the person: out of reach */
  notReachable:
    headerIcon(svg`<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4.2 3.3-6.8 7.5-6.8s7.5 2.6 7.5 6.8"/>
    <path d="M4 4 20 20" stroke="var(--btn)" stroke-width="5"/><path d="M4 4 20 20"/>`),
  /** a funnel: filter by this */
  funnel: headerIcon(svg`<path d="M3.5 4.5h17l-6.5 8v6l-4 2v-8Z"/>`),
};
