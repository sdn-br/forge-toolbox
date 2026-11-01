// The side panel of the PvP box: the selected battle with its units, measured armies and result, then its plunder.
import { html, nothing, type TemplateResult } from 'lit-html';
import { t } from '../../../core/texts';
import { battleDetailsView } from '../../../ui/battle-details';
import { headerIcons } from '../../../ui/icons';
import { guildTag } from '../../../ui/links';
import type { BattlePanelVm, PlunderVm } from './view-model';

/** the game's Double Loot mark beside the building, the word while the image is not known */
const doubleLoot = (p: PlunderVm) => {
  if (!p.doubleLoot) return nothing;
  const word = t('plunder.doubleLoot');
  return p.doubleLootIcon
    ? html` <img class="double-loot" src=${p.doubleLootIcon} alt=${word} data-tip=${word} width="16" height="16"
        referrerpolicy="no-referrer" />`
    : html` <b>${word}</b>`;
};

/** a heading, then the building in bold with the Double Loot mark, then the loot or that the plunder was repelled */
const plunderView = (p: PlunderVm) =>
  html`<h2>${t('pvp.plunder.title')}</h2><p><b>${p.building}</b>${doubleLoot(p)}</p>${
    p.outcome === 'repelled' ? html`<p class="muted">${t('pvp.plunder.repelled')}</p>` : html`<p>${p.loot}</p>`
  }`;

/** the selected battle */
export function battlePanel(vm: BattlePanelVm): TemplateResult {
  return html`<h2>${vm.name}${vm.guild ? html` ${guildTag(vm.guild)}` : ''}</h2><p><span class="muted">${vm.when}</span> <span class=${`pvp-outcome ${vm.outcome}`} role="img" data-tip=${vm.result}
    aria-label=${vm.result}>${headerIcons[vm.outcome]}</span></p>${
      vm.details ? battleDetailsView(vm.details) : html`<p class="muted">${t('pvp.inferredTip')}</p>`
    }${vm.plunder ? plunderView(vm.plunder) : ''}`;
}
