// What the three tabs of the PvP box share: the filter, the pages, the lead cells of a row (note marker and opponent) and
// the list around the table (totals, empty text, paging).
import { html, type TemplateResult } from 'lit-html';
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { Player } from '../../../shared/model';
import { type TextKey, t, textFilter } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { externalIcon, nameWithGuild } from '../../ui/links';
import { plainText } from '../../ui/markdown';
import type { PlayerLookups } from '../shared/player-lookups';

export type PvpTab = 'battles' | 'plunders' | 'incoming';

export const PAGE_SIZE = 20;

/** A picked player wins over the search text. */
export interface PvpFilter {
  text: string;
  opponent?: PlayerId;
}

/** The opponents a filter asks for; undefined means all, an empty list means none matches. */
export function opponentsFor(filter: PvpFilter, players: Player[]): PlayerId[] | undefined {
  if (filter.opponent !== undefined) return [filter.opponent];
  if (!filter.text.trim()) return undefined;
  const matches = textFilter(filter.text);
  return players.filter((p) => matches(p.name)).map((p) => p.id);
}

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

/** what the box does on a click; the tabs add nothing of their own */
export interface PvpActions {
  tab(tab: PvpTab): void;
  search(text: string): void;
  pick(opponent: PlayerId): void;
  clearPick(): void;
  page(page: number): void;
  /** shows or hides the details of a battle row */
  expand(battleId: number): void;
  /** filters to this player and opens their note for typing */
  note(opponent: PlayerId): void;
}

/** what a tab turns into its view model besides the rows it loaded */
export interface ViewInput {
  filter: PvpFilter;
  page: number;
  lookups: PlayerLookups;
  building: (id: BuildingDefId) => string | undefined;
  resourceName: (id: string) => string | undefined;
  /** the Markdown note of a player, if any */
  note: (id: PlayerId) => string | undefined;
  now: number;
  /** battle ids whose rows show their details */
  expanded: ReadonlySet<number>;
}

/** what every tab shows around its rows */
export interface ListVm {
  /** the line above the table */
  totals: string;
  search: string;
  /** name of the picked player */
  picked?: string;
  page: number;
  pages: number;
  empty?: 'none' | 'noMatch';
}

/** the opponent's name, as a row shows it */
export const nameOf = ({ lookups }: ViewInput, id: PlayerId) => lookups.playerName(id) || String(id);

/** `total` is the number of rows of the shown tab over all pages */
export function listVm(input: ViewInput, total: number, totals: string): ListVm {
  const { filter, page } = input;
  const filtered = filter.opponent !== undefined || filter.text.trim() !== '';
  return {
    totals,
    search: filter.text,
    picked: filter.opponent === undefined ? undefined : nameOf(input, filter.opponent),
    page,
    pages: pageCount(total),
    empty: total > 0 ? undefined : filtered ? 'noMatch' : 'none',
  };
}

/** what the first cells of a row show about a player */
export interface OpponentVm {
  name: string;
  /** the name with the guild, for the tooltip */
  nameTip: string;
  /** the opponent's page at foestats */
  url: string;
  /** the opponent's note as plain text, empty when there is none */
  note: string;
}

export function opponentVm(input: ViewInput, id: PlayerId): OpponentVm {
  const name = nameOf(input, id);
  return {
    name,
    nameTip: nameWithGuild(name, input.lookups.playerGuild(id)?.name),
    url: input.lookups.playerUrl(id),
    note: plainText(input.note(id) ?? ''),
  };
}

/** the name filters to the player, the icon beside it opens their page at foestats; the name's tooltip adds the guild */
export const opponentLink = (
  r: { opponent: PlayerId; name: string; nameTip: string; url: string },
  actions: PvpActions,
) =>
  html`<td><a href="#" data-tip=${r.nameTip} @click=${(e: Event) => {
    e.preventDefault();
    actions.pick(r.opponent);
  }}>${r.name}</a> ${externalIcon(r.url, t('foestats.open'))}</td>`;

/** a note sheet per row: dim without a note, the note as tooltip */
export const noteMarker = (opponent: PlayerId, note: string, actions: PvpActions) =>
  html`<td><button class=${note ? 'marker' : 'marker dim'} data-tip=${note || t('notes.add')}
    aria-label=${t('notes.add')} @click=${() => actions.note(opponent)}>${headerIcons.note}</button></td>`;

const paging = (vm: ListVm, actions: PvpActions) =>
  vm.pages <= 1
    ? ''
    : html`<p>
      <button class="action icon-only" ?disabled=${vm.page === 0} data-tip=${t('pvp.previous')} aria-label=${t('pvp.previous')}
        @click=${() => actions.page(vm.page - 1)}>${headerIcons.chevronLeft}</button>
      ${t('pvp.page', { page: vm.page + 1, pages: vm.pages })}
      <button class="action icon-only" ?disabled=${vm.page >= vm.pages - 1} data-tip=${t('pvp.next')} aria-label=${t('pvp.next')}
        @click=${() => actions.page(vm.page + 1)}>${headerIcons.chevronRight}</button>
    </p>`;

/** the totals, then the table with the paging, or the text for an empty list; `empty` has one text per case */
export function listView(
  vm: ListVm,
  actions: PvpActions,
  empty: { none: TextKey; noMatch: TextKey },
  table: TemplateResult,
) {
  const totals = html`<p>${vm.totals}</p>`;
  if (vm.empty) return html`${totals}<p class="muted">${t(empty[vm.empty])}</p>`;
  return html`${totals}${table}${paging(vm, actions)}`;
}
