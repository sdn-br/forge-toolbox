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

/** the building's image with the Double Loot mark on a badge in its lower right corner, like the class of a unit */
const image = (p: PlunderVm, url: string) =>
  html`<span class="building-img"><img src=${url} alt="" loading="lazy" referrerpolicy="no-referrer" />${
    p.doubleLoot && p.doubleLootIcon ? html`<span class="double-loot-badge">${doubleLootMark(p)}</span>` : nothing
  }</span>`;

/** the building in bold, then the loot one resource per line, or that it was repelled; the building's image on the
 * left once it is known. The Double Loot mark sits on the image, so a long name cannot push it onto a line of its
 * own; without the image, or while the mark's image is not known, it follows the name. */
export function plunderCard(p: PlunderVm): TemplateResult {
  const onImage = p.image !== undefined && p.doubleLootIcon !== undefined;
  const mark = p.doubleLoot && !onImage ? html` ${doubleLootMark(p)}` : nothing;
  const text = html`<div><p><b>${p.building}</b>${mark}</p>${
    p.outcome === 'repelled'
      ? html`<p class="muted">${t('pvp.plunder.repelled')}</p>`
      : html`<p>${p.loot.map((line, i) => html`${i ? html`<br />` : nothing}${line}`)}</p>`
  }</div>`;
  return html`<div class="plunder-card">${p.image ? image(p, p.image) : nothing}${text}</div>`;
}
