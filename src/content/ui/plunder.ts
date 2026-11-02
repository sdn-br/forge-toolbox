// One plunder with the image of its building on the left: the PvP side panel and the visited city.
import { html, nothing, type TemplateResult } from 'lit-html';
import { t } from '../core/texts';
import type { PlunderVm } from '../features/shared/plunder';

/** the game's Double Loot mark, the word while the image is not known */
const doubleLootMark = (p: PlunderVm) => {
  const word = t('plunder.doubleLoot');
  return p.doubleLootIcon
    ? html`<img class="double-loot" src=${p.doubleLootIcon} alt=${word} data-tip=${word} width="16" height="16"
        referrerpolicy="no-referrer" />`
    : html`<b>${word}</b>`;
};

/**
 * The time of the plunder above it, given by the caller ("heute 06:46", "Zuletzt heute 06:46"), then the building's
 * image on the left once it is known, the building in bold beside it and the loot one resource per line below, or that
 * it was repelled. The Double Loot mark follows the time, in line with the building's name, so a long name cannot push
 * it onto a line of its own.
 */
export function plunderCard(p: PlunderVm, when: string): TemplateResult {
  const text = html`<div><p><b>${p.building}</b></p>${
    p.outcome === 'repelled'
      ? html`<p class="muted">${t('pvp.plunder.repelled')}</p>`
      : html`<p>${p.loot.map((line, i) => html`${i ? html`<br />` : nothing}${line}`)}</p>`
  }</div>`;
  return html`<p class=${`plunder-when muted${p.image ? ' with-image' : ''}`}><span>${when}</span>${
    p.doubleLoot ? doubleLootMark(p) : nothing
  }</p><div class="plunder-card">${
    p.image
      ? html`<img class="building-img" src=${p.image} alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : nothing
  }${text}</div>`;
}
