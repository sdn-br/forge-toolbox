import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import type { PlunderItem, SabotageVm } from './view-model';

const percent = (n: number) => `${formatNumber(n)} %`;

const armyCells = (army: ArmyValues | undefined) =>
  army
    ? html`<td class="num">${percent(army.attack)}</td><td class="num">${percent(army.defense)}</td>`
    : html`<td></td><td></td>`;

function armyTable(army: NonNullable<SabotageVm['army']>, repel: number, measured: SabotageVm['measured']) {
  const heads = html`<th class="num">${t('sabotage.attack')}</th><th class="num">${t('sabotage.defense')}</th>`;
  return html`
  <table>
    ${
      measured
        ? html`<tr><th></th><th class="num" colspan="2">${t('sabotage.calculated')}</th>
            <th class="num" colspan="2">${t('sabotage.measured', { when: measured.when })}</th></tr>`
        : ''
    }
    <tr><th></th>${heads}${measured ? heads : ''}</tr>
    <tr><td>${t('sabotage.attacker')}</td>${armyCells(army.attacker)}${measured ? armyCells(undefined) : ''}</tr>
    <tr><td>${t('sabotage.defender')}</td>${armyCells(army.defender)}${measured ? armyCells(measured.defender) : ''}</tr>
    <tr><td>${t('sabotage.plunderRepel')}</td><td class="num" colspan="2">${percent(repel)}</td></tr>
  </table>
  ${measured ? html`<p class="muted">${t('sabotage.measuredHint')}</p>` : ''}`;
}

const plunderTable = (items: PlunderItem[]) =>
  html`<table>${items.map(
    (p) => html`<tr><td>${p.name}</td>
    <td>${p.items.map((i) => html`${formatNumber(i.amount)} ${i.label}<br />`)}</td></tr>`,
  )}</table>`;

function plunderedPart({ last, totals }: NonNullable<SabotageVm['plundered']>) {
  if (!last) return html`<p class="muted">${t('sabotage.neverPlundered')}</p>`;
  if (last.repelled) {
    const text = last.building
      ? t('sabotage.lastRepelledAt', { when: last.when, building: last.building })
      : t('sabotage.lastRepelled', { when: last.when });
    return html`<p>${text}<br />${totals}</p>`;
  }
  return html`<p>${t('sabotage.lastPlunder', { when: last.when, building: last.building })}: ${last.loot}
      ${last.doubleLoot ? html`<b>${t('plunder.doubleLoot')}</b>` : ''}
    <br />${totals}</p>`;
}

export function sabotageView(vm: SabotageVm | undefined): TemplateResult {
  if (!vm) return html`<p class="muted">${t('sabotage.noVisit')}</p>`;
  return html`
    <p><b>${vm.player.name}</b>${vm.player.guild ? html` <span class="muted">[${vm.player.guild}]</span>` : ''}
      <br /><span class="muted">${t('sabotage.era')}: ${vm.player.era}</span></p>
    ${vm.lootable ? '' : html`<p class="warn">${t('sabotage.notLootable')}</p>`}
    ${vm.army ? armyTable(vm.army, vm.plunderRepel, vm.measured) : ''}
    ${vm.plundered ? html`<h2>${t('sabotage.plundered')}</h2>${plunderedPart(vm.plundered)}` : ''}
    <h2>${t('sabotage.plunderable')}</h2>
    ${
      vm.plunderable.length === 0
        ? html`<p class="muted">${t('sabotage.nothingPlunderable')}</p>`
        : plunderTable(vm.plunderable)
    }
    ${vm.incomplete ? html`<p class="warn">${t('sabotage.incomplete')}</p>` : ''}`;
}
