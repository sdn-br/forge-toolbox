import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import type { SabotageVm } from './view-model';

const armyTable = (army: NonNullable<SabotageVm['army']>, repel: number) => html`
  <table>
    <tr><th></th><th class="num">${t('sabotage.attack')}</th><th class="num">${t('sabotage.defense')}</th></tr>
    <tr><td>${t('sabotage.attacker')}</td><td class="num">${formatNumber(army.attacker.attack)} %</td><td class="num">${formatNumber(army.attacker.defense)} %</td></tr>
    <tr><td>${t('sabotage.defender')}</td><td class="num">${formatNumber(army.defender.attack)} %</td><td class="num">${formatNumber(army.defender.defense)} %</td></tr>
    <tr><td>${t('sabotage.plunderRepel')}</td><td class="num" colspan="2">${formatNumber(repel)} %</td></tr>
  </table>`;

export function sabotageView(vm: SabotageVm | undefined): TemplateResult {
  if (!vm) return html`<p class="muted">${t('sabotage.noVisit')}</p>`;
  return html`
    <p><b>${vm.player.name}</b>${vm.player.guild ? html` <span class="muted">[${vm.player.guild}]</span>` : ''}
      <br /><span class="muted">${t('sabotage.era')}: ${vm.player.era}</span></p>
    ${vm.lootable ? '' : html`<p class="warn">${t('sabotage.notLootable')}</p>`}
    ${vm.army ? armyTable(vm.army, vm.plunderRepel) : ''}
    <h2>${t('sabotage.plunderable')}</h2>
    ${
      vm.plunderable.length === 0
        ? html`<p class="muted">${t('sabotage.nothingPlunderable')}</p>`
        : html`<table>${vm.plunderable.map(
            (p) =>
              html`<tr><td>${p.name}</td><td>${p.items.map((i) => html`${formatNumber(i.amount)} ${i.label}<br />`)}</td><td class="num muted">${p.when}</td></tr>`,
          )}</table>`
    }
    ${vm.incomplete ? html`<p class="warn">${t('sabotage.incomplete')}</p>` : ''}
    ${vm.army && vm.setsIgnored ? html`<p class="muted">${t('sabotage.setsIgnored')}</p>` : ''}`;
}
