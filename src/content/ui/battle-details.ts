// The details of one stored battle: both armies unit by unit, measured bonuses and result. The same in every box.
import { html, nothing, type TemplateResult } from 'lit-html';
import { t } from '../core/texts';
import type { ArmyValues } from '../domain/assess-city';
import { formatArmy } from './army-format';

export interface UnitVm {
  /** the unit's name in the game's language, its type id while the catalog does not know it */
  unit: string;
  /** "8/10 LP" after the battle, "gefallen" when the unit died */
  hp: string;
  /** era and class of the unit type, for the tooltip of its cell */
  tip?: string;
  /** the full URL of the unit's portrait on the Inno CDN; missing while unknown */
  image?: string;
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

/** a portrait that does not load leaves no broken image behind */
const hideBroken = (e: Event) => {
  (e.target as HTMLElement).hidden = true;
};

/** the game's portrait beside the name; the name says what it shows, so it has no alt text */
const portrait = (url: string | undefined) =>
  url
    ? html`<img class="unit-img" src=${url} alt="" width="24" height="24" loading="lazy" referrerpolicy="no-referrer"
        @error=${hideBroken} />`
    : nothing;

/** the unit with its portrait, its hit points below it, so a narrow column never wraps a line */
const unitCell = (u: UnitVm | undefined) =>
  u
    ? html`<td class=${u.dead ? 'muted' : ''} data-tip=${u.tip ?? nothing}><div class="unit">${portrait(u.image)}<div>${u.unit}<div class="hp">${u.hp}</div></div></div></td>`
    : html`<td></td>`;

/** the head of a side: its word, below it the measured army; the label of the values is the tooltip */
const head = (word: string, army: ArmyValues | undefined) =>
  army
    ? html`<th data-tip=${t('battle.army')}>${word}<div class="army">${formatArmy(army)}</div></th>`
    : html`<th>${word}</th>`;

/** one column per side, the measured armies in the heads, then the units */
export function battleDetailsView(vm: BattleDetailsVm): TemplateResult {
  const rows = Array.from({ length: Math.max(vm.own.length, vm.opponent.length) }, (_, i) => i);
  return html`<div class="battle">
    <p>${vm.summary}</p>
    <table>
      <tr>${head(t('battle.own'), vm.army?.own)}${head(t('battle.opponent'), vm.army?.opponent)}</tr>
      ${rows.map((i) => html`<tr>${unitCell(vm.own[i])}${unitCell(vm.opponent[i])}</tr>`)}
    </table></div>`;
}
