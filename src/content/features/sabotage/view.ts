import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import type { PlunderItem, SabotageVm } from './view-model';

const armyTable = (army: NonNullable<SabotageVm['army']>, repel: number) => html`
  <table>
    <tr><th></th><th class="num">${t('sabotage.attack')}</th><th class="num">${t('sabotage.defense')}</th></tr>
    <tr><td>${t('sabotage.attacker')}</td><td class="num">${formatNumber(army.attacker.attack)} %</td><td class="num">${formatNumber(army.attacker.defense)} %</td></tr>
    <tr><td>${t('sabotage.defender')}</td><td class="num">${formatNumber(army.defender.attack)} %</td><td class="num">${formatNumber(army.defender.defense)} %</td></tr>
    <tr><td>${t('sabotage.plunderRepel')}</td><td class="num" colspan="2">${formatNumber(repel)} %</td></tr>
  </table>`;

const plunderTable = (items: PlunderItem[]) =>
  html`<table>${items.map(
    (p) => html`<tr><td>${p.name}${p.when ? html`<br /><span class="muted">${p.when}</span>` : ''}</td>
    <td>${p.items.map((i) => html`${formatNumber(i.amount)} ${i.label}<br />`)}</td></tr>`,
  )}</table>`;

export function sabotageView(vm: SabotageVm | undefined): TemplateResult {
  if (!vm) return html`<p class="muted">${t('sabotage.noVisit')}</p>`;
  return html`
    <p><b>${vm.player.name}</b>${vm.player.guild ? html` <span class="muted">[${vm.player.guild}]</span>` : ''}
      <br /><span class="muted">${t('sabotage.era')}: ${vm.player.era}</span></p>
    ${vm.lootable ? '' : html`<p class="warn">${t('sabotage.notLootable')}</p>`}
    ${vm.army ? armyTable(vm.army, vm.plunderRepel) : ''}
    <h2>${t('sabotage.plunderable')}</h2>
    ${vm.ready.length === 0 ? html`<p class="muted">${t('sabotage.nothingPlunderable')}</p>` : plunderTable(vm.ready)}
    ${vm.producing.length === 0 ? '' : html`<h2>${t('sabotage.producing', { count: vm.producing.length })}</h2>${plunderTable(vm.producing)}`}
    ${vm.incomplete ? html`<p class="warn">${t('sabotage.incomplete')}</p>` : ''}`;
}
