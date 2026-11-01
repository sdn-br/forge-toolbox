// The side panel of the PvP box: the selected battle with its units, measured armies and result, then its plunder.
import { html, type TemplateResult } from 'lit-html';
import { t } from '../../../core/texts';
import { battleDetailsView } from '../../../ui/battle-details';
import type { BattlePanelVm, PlunderVm } from './view-model';

/** "Plünderung: Strohdachhaus · 1.220 Münzen Double Loot", "Plünderung abgewehrt: –" */
const plunderView = (p: PlunderVm) =>
  html`<p class="pvp-plunder">${t(`pvp.plunder.${p.outcome}`, { building: p.building })}${p.loot ? ` · ${p.loot}` : ''}${
    p.doubleLoot ? html` <b>${t('plunder.doubleLoot')}</b>` : ''
  }</p>`;

/** the selected battle, or a hint how to select one */
export function battlePanel(vm: BattlePanelVm | undefined): TemplateResult {
  if (!vm) return html`<p class="muted">${t('pvp.panelHint')}</p>`;
  return html`<h2 data-tip=${vm.nameTip}>${vm.name}</h2><p class="muted">${vm.when}</p>${
    vm.details ? battleDetailsView(vm.details) : html`<p class="muted">${t('pvp.inferredTip')}</p>`
  }${vm.plunder ? plunderView(vm.plunder) : ''}`;
}
