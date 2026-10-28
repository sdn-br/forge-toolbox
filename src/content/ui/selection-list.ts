// The selected buildings of the own city as labels side by side, one per name with "selected/in the city" and a ✕
// that removes the buildings of that name (Nutzer, 2026-10-26: like labels, the count and ✕ close to their name), and a
// button after them that removes all. The building search and the city map show
// the same list.
import { html, type TemplateResult } from 'lit-html';
import type { OwnSelection } from '../core/selection';
import { formatNumber, t } from '../core/texts';
import { iconButton } from './buttons';
import { headerIcons } from './icons';

export function selectionList(selection: Pick<OwnSelection, 'entries' | 'removeName' | 'clear'>): TemplateResult {
  const entries = selection.entries();
  if (entries.length === 0) return html`<div class="selection"><p class="muted">${t('selection.empty')}</p></div>`;
  return html`<div class="selection">
    <ul class="selection-list">${entries.map(
      (e) => html`<li><span class="name">${e.name}</span>
        <span class="num">${formatNumber(e.selected)}/${formatNumber(e.total)}</span>
        ${iconButton(
          t('selection.removeName', { name: e.name }),
          () => selection.removeName(e.name),
          headerIcons.close,
          'icon',
          t('selection.remove'),
        )}</li>`,
    )}</ul>
    ${iconButton(t('selection.clear'), () => selection.clear(), headerIcons.trash, 'action icon-only')}
  </div>`;
}
