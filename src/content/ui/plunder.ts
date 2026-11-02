// One plunder with the image of its building on the left: the PvP side panel and the visited city.
import { html, nothing, type TemplateResult } from 'lit-html';
import { t } from '../core/texts';
import type { PlunderVm } from '../features/shared/plunder';

/** the game's Double Loot mark beside the building, the word while the image is not known */
const doubleLoot = (p: PlunderVm) => {
  if (!p.doubleLoot) return nothing;
  const word = t('plunder.doubleLoot');
  return p.doubleLootIcon
    ? html` <img class="double-loot" src=${p.doubleLootIcon} alt=${word} data-tip=${word} width="16" height="16"
        referrerpolicy="no-referrer" />`
    : html` <b>${word}</b>`;
};

/** the building in bold with the Double Loot mark, then the loot one resource per line, or that it was repelled; the
 * building's image on the left once it is known */
export function plunderCard(p: PlunderVm): TemplateResult {
  const text = html`<div><p><b>${p.building}</b>${doubleLoot(p)}</p>${
    p.outcome === 'repelled'
      ? html`<p class="muted">${t('pvp.plunder.repelled')}</p>`
      : html`<p>${p.loot.map((line, i) => html`${i ? html`<br />` : nothing}${line}`)}</p>`
  }</div>`;
  return html`<div class="plunder-card">${
    p.image
      ? html`<img class="building-img" src=${p.image} alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : nothing
  }${text}</div>`;
}
