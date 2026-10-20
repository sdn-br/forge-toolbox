// The details of one stored battle: both armies unit by unit, measured bonuses and result. The same in every box.
import { html, type TemplateResult } from 'lit-html';
import type { Battle, BattleUnit } from '../../shared/model';
import { formatNumber, t } from '../core/texts';
import type { ArmyValues } from '../domain/assess-city';
import { measuredArmy } from '../domain/measured-army';

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

const unitVm = (u: BattleUnit): UnitVm => ({
  unit: u.unitTypeId,
  hp: u.endHp > 0 ? t('battle.hp', { end: formatNumber(u.endHp), start: formatNumber(u.startHp) }) : t('battle.dead'),
  dead: u.endHp <= 0,
});

/** `army: false` leaves out the measured armies, for where the attack and defense values are switched off */
export function battleDetails(battle: Battle, options: { army: boolean } = { army: true }): BattleDetailsVm {
  const rounds = battle.rounds === 1 ? t('pvp.round') : t('pvp.rounds', { count: battle.rounds });
  const measured = measuredArmy(battle);
  return {
    summary: [t(`pvp.${battle.result}`), battle.auto ? t('pvp.auto') : t('battle.manual'), rounds].join(', '),
    own: battle.attacker.units.map(unitVm),
    opponent: battle.defender.units.map(unitVm),
    army: options.army ? { own: measured.attacker, opponent: measured.defender } : undefined,
  };
}

const unitCells = (u: UnitVm | undefined) =>
  u
    ? html`<td class=${u.dead ? 'muted' : ''}>${u.unit}</td><td class=${u.dead ? 'num muted' : 'num'}>${u.hp}</td>`
    : html`<td></td><td></td>`;

const army = (a: ArmyValues) => `${formatNumber(a.attack)} % / ${formatNumber(a.defense)} %`;

export function battleDetailsView(vm: BattleDetailsVm): TemplateResult {
  const rows = Array.from({ length: Math.max(vm.own.length, vm.opponent.length) }, (_, i) => i);
  return html`<div class="battle">
    <p>${vm.summary}</p>
    <table>
      <tr><th>${t('battle.own')}</th><th></th><th>${t('battle.opponent')}</th><th></th></tr>
      ${rows.map((i) => html`<tr>${unitCells(vm.own[i])}${unitCells(vm.opponent[i])}</tr>`)}
      ${
        vm.army
          ? html`<tr><td>${t('battle.army')}</td><td class="num">${army(vm.army.own)}</td>
              <td></td><td class="num">${army(vm.army.opponent)}</td></tr>`
          : ''
      }
    </table></div>`;
}
