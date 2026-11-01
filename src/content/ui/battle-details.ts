// The details of one stored battle: both armies unit by unit, measured bonuses and result. The same in every box.
import { html, type TemplateResult } from 'lit-html';
import { t } from '../core/texts';
import type { ArmyValues } from '../domain/assess-city';
import { formatArmy } from './army-format';

export interface UnitVm {
  /** the game's unit type id; there is no catalog of unit names yet */
  unit: string;
  /** "8/10 LP" after the battle, "gefallen" when the unit died */
  hp: string;
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

/** the unit, its hit points below it, so a narrow column never wraps a line */
const unitCell = (u: UnitVm | undefined) =>
  u ? html`<td class=${u.dead ? 'muted' : ''}>${u.unit}<div class="hp">${u.hp}</div></td>` : html`<td></td>`;

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
