// The details of one stored battle: both armies unit by unit, measured bonuses and result. The same in every box.
import { html, nothing, type TemplateResult } from 'lit-html';
import { t } from '../core/texts';
import type { ArmyValues } from '../domain/assess-city';
import { formatArmy } from './army-format';

export interface UnitVm {
  /** the unit's name in the game's language, its type id while the catalog does not know it */
  unit: string;
  /** name with era, class and hit points, the tooltip of its tile */
  tip: string;
  /** the full URL of the unit's portrait on the Inno CDN; missing while unknown */
  image?: string;
  /** the full URL of the game's icon of the unit's class; missing while unknown */
  classIcon?: string;
  /** hit points left after the battle, 0 to 1 */
  health: number;
  dead: boolean;
}

export interface BattleDetailsVm {
  /** "gewonnen, Autokampf, 3 Runden" */
  summary: string;
  /** the session player is always the attacker */
  own: UnitVm[];
  opponent: UnitVm[];
  army?: { own: ArmyValues; opponent: ArmyValues };
}

/** an image that does not load leaves no broken image behind */
const hideBroken = (e: Event) => {
  (e.target as HTMLElement).hidden = true;
};

const img = (cls: string, url: string, size: number) =>
  html`<img class=${cls} src=${url} alt="" width=${size} height=${size} loading="lazy" referrerpolicy="no-referrer"
    @error=${hideBroken} />`;

/** a unit as the game draws it: the portrait (the name without one), the class icon on a dark round badge, the health
 * bar below; the name, era, class and hit points are its tooltip */
const unitTile = (u: UnitVm) =>
  html`<div class=${u.dead ? 'unit-tile dead' : 'unit-tile'} data-tip=${u.tip} aria-label=${u.tip}>
    ${u.image ? img('unit-img', u.image, 40) : html`<span class="unit-img unit-name">${u.unit}</span>`}
    ${u.classIcon ? html`<span class="unit-class">${img('', u.classIcon, 13)}</span>` : nothing}
    <span class="unit-health"><span style=${`width: ${Math.round(u.health * 100)}%`}></span></span>
  </div>`;

const tiles = (units: UnitVm[]) => html`<td><div class="unit-tiles">${units.map(unitTile)}</div></td>`;

/** the head of a side: its word, below it the measured army; the label of the values is the tooltip */
const head = (word: string, army: ArmyValues | undefined) =>
  army
    ? html`<th data-tip=${t('battle.army')}>${word}<div class="army">${formatArmy(army)}</div></th>`
    : html`<th>${word}</th>`;

/** one column per side, the measured armies in the heads, then the units as tiles */
export function battleDetailsView(vm: BattleDetailsVm): TemplateResult {
  return html`<div class="battle">
    <p>${vm.summary}</p>
    <table>
      <tr>${head(t('battle.own'), vm.army?.own)}${head(t('battle.opponent'), vm.army?.opponent)}</tr>
      <tr>${tiles(vm.own)}${tiles(vm.opponent)}</tr>
    </table></div>`;
}
