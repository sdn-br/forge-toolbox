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

const unitCells = (u: UnitVm | undefined) =>
  u
    ? html`<td class=${u.dead ? 'muted' : ''}>${u.unit}</td><td class=${u.dead ? 'num muted' : 'num'}>${u.hp}</td>`
    : html`<td></td><td></td>`;

export function battleDetailsView(vm: BattleDetailsVm): TemplateResult {
  const rows = Array.from({ length: Math.max(vm.own.length, vm.opponent.length) }, (_, i) => i);
  return html`<div class="battle">
    <p>${vm.summary}</p>
    <table>
      <tr><th colspan="2">${t('battle.own')}</th><th colspan="2">${t('battle.opponent')}</th></tr>
      ${rows.map((i) => html`<tr>${unitCells(vm.own[i])}${unitCells(vm.opponent[i])}</tr>`)}
      ${
        vm.army
          ? html`<tr><td>${t('battle.army')}</td><td class="num">${formatArmy(vm.army.own)}</td>
              <td></td><td class="num">${formatArmy(vm.army.opponent)}</td></tr>`
          : ''
      }
    </table></div>`;
}
