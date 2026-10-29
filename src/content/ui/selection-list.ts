// The selected buildings of the own city as labels side by side, one per name with "selected/in the city" and a ✕
// that removes the buildings of that name (Nutzer, 2026-10-26: like labels, the count and ✕ close to their name), and a
// button after them that removes all. The building search and the city map show
// the same list.
import { html, type TemplateResult } from 'lit-html';
import { compareText, formatNumber, t } from '../core/texts';
import { nameOf } from '../domain/city-grid';
import type { OwnSelection } from '../stores/selection';
import { iconButton } from './buttons';
import { headerIcons } from './icons';

/** One name in the selection: how many of its buildings are selected, of how many in the city. */
export interface SelectionEntry {
  name: string;
  selected: number;
  total: number;
}

/** The selected buildings grouped by name, each with the number of buildings of that name; sorted by name. */
export function groupSelection(
  buildings: Iterable<{ id: number; name: string }>,
  selected: ReadonlySet<number>,
): SelectionEntry[] {
  const byName = new Map<string, SelectionEntry>();
  for (const { id, name } of buildings) {
    const entry = byName.get(name) ?? { name, selected: 0, total: 0 };
    entry.total++;
    if (selected.has(id)) entry.selected++;
    byName.set(name, entry);
  }
  return [...byName.values()].filter((e) => e.selected > 0).sort((a, b) => compareText(a.name, b.name));
}

type ListedSelection = Pick<OwnSelection, 'buildings' | 'ids' | 'removeName' | 'clear'>;

/** the entries of the list: the selection of the own city grouped by name */
export const selectionEntries = (selection: Pick<OwnSelection, 'buildings' | 'ids'>) =>
  groupSelection(
    selection.buildings().map((f) => ({ id: f.building.id, name: nameOf(f) })),
    selection.ids(),
  );

export function selectionList(selection: ListedSelection): TemplateResult {
  const entries = selectionEntries(selection);
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
