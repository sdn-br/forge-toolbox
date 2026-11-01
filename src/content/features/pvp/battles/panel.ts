// The side panel of the PvP box: the selected battle with its units, measured armies and result, then its plunder.
import { html, type TemplateResult } from 'lit-html';
import { t } from '../../../core/texts';
import { battleDetailsView } from '../../../ui/battle-details';
import { guildTag } from '../../../ui/links';
import type { BattlePanelVm, PlunderVm } from './view-model';

/** a heading, then the building, then the loot with Double Loot or that the plunder was repelled */
const plunderView = (p: PlunderVm) =>
  html`<h2>${t('pvp.plunder.title')}</h2><p>${p.building}</p>${
    p.outcome === 'repelled'
      ? html`<p class="muted">${t('pvp.plunder.repelled')}</p>`
      : html`<p>${p.loot}${p.doubleLoot ? html` <b>${t('plunder.doubleLoot')}</b>` : ''}</p>`
  }`;

/** the selected battle */
export function battlePanel(vm: BattlePanelVm): TemplateResult {
  return html`<h2>${vm.name}${vm.guild ? html` ${guildTag(vm.guild)}` : ''}</h2><p class="muted">${vm.when}</p>${
    vm.details ? battleDetailsView(vm.details) : html`<p class="muted">${t('pvp.inferredTip')}</p>`
  }${vm.plunder ? plunderView(vm.plunder) : ''}`;
}
