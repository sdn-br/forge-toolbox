// The selected buildings of the own city as a list, one entry per name with "selected/in the city", each with a ✕
// that removes the buildings of that name, and a button that removes all. The building search and the city map show
// the same list.
import { html, type TemplateResult } from 'lit-html';
import type { OwnSelection } from '../core/selection';
import { formatNumber, t } from '../core/texts';
import { headerIcons } from './icons';

export function selectionList(selection: Pick<OwnSelection, 'entries' | 'removeName' | 'clear'>): TemplateResult {
  const entries = selection.entries();
  if (entries.length === 0) return html`<div class="selection"><p class="muted">${t('selection.empty')}</p></div>`;
  return html`<div class="selection">
    <ul class="selection-list">${entries.map(
      (e) => html`<li><span class="name">${e.name}</span>
        <span class="num">${formatNumber(e.selected)}/${formatNumber(e.total)}</span>
        <button class="icon" data-tip=${t('selection.remove')} aria-label=${t('selection.removeName', { name: e.name })}
          @click=${() => selection.removeName(e.name)}>${headerIcons.close}</button></li>`,
    )}</ul>
    <button class="action icon-only" data-tip=${t('selection.clear')} aria-label=${t('selection.clear')}
      @click=${() => selection.clear()}>${headerIcons.trash}</button>
  </div>`;
}
