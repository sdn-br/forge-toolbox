// What both tabs of the PvP box share: the filter, the lead cells of a row (note marker and opponent with the PvP marks
// and the funnel) and the list around the table (totals, empty text, row window).
import { html, type TemplateResult } from 'lit-html';
import { type BuildingDefId, type PlayerId, playerId } from '../../../shared/ids';
import type { Player } from '../../../shared/model';
import { sameName, type TextKey, t, textFilter } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { externalLink, nameWithGuild } from '../../ui/links';
import { plainText } from '../../ui/markdown';
import { pickButton } from '../../ui/pick';
import { pvpMarks } from '../../ui/pvp-marks';
import { type RowWindow, windowedRows } from '../../ui/windowed-rows';
import type { PvpPlayerLookups, PvpRowActions } from '../shared/player-lookups';

export type PvpTab = 'battles' | 'incoming';

/** what the rows are narrowed to; the name field is the only state of the player filter */
export interface PvpFilter {
  /** a name typed or written by the funnel; the exact name of a known player means that player alone */
  name: string;
  /** only players marked good to plunder */
  onlyPlunder: boolean;
  /** only players marked not to attack */
  onlyNoAttack: boolean;
  /** only battles with a plunder; the attacks on the own city have no such filter */
  withPlunder: boolean;
}

export const NO_FILTER: PvpFilter = { name: '', onlyPlunder: false, onlyNoAttack: false, withPlunder: false };

/** a row of a player the store does not know shows the id as the name, so that text names the player too */
const idOf = (text: string) => (/^\d+$/.test(text) ? playerId(Number(text)) : undefined);

/** The players the name field names: the players with exactly this name, else every name containing the text; undefined
 * for an empty field. */
function named(name: string, players: Player[]): PlayerId[] | undefined {
  const text = name.trim();
  if (!text) return undefined;
  const exact = players.filter((p) => sameName(p.name, text));
  const contains = textFilter(text);
  const ids = (exact.length > 0 ? exact : players.filter((p) => contains(p.name))).map((p) => p.id);
  const id = idOf(text);
  return id === undefined || ids.includes(id) ? ids : [...ids, id];
}

/** The opponents a filter asks for; undefined means all, an empty list means none matches. The star and the warning
 * filter keep only players with that PvP mark, together with the name. */
export function opponentsFor(filter: PvpFilter, players: Player[]): PlayerId[] | undefined {
  const byName = named(filter.name, players);
  if (!filter.onlyPlunder && !filter.onlyNoAttack) return byName;
  const marked = players
    .filter((p) => (!filter.onlyPlunder || p.plunderWorthy === true) && (!filter.onlyNoAttack || p.noAttack === true))
    .map((p) => p.id);
  return byName === undefined ? marked : marked.filter((id) => byName.includes(id));
}

/** The one player the name field names exactly, for the note card: a known player by name, else the id a row shows for a
 * player the store does not know. */
export function pickedPlayer(name: string, players: Player[]): PlayerId | undefined {
  const text = name.trim();
  if (!text) return undefined;
  const exact = players.filter((p) => sameName(p.name, text));
  if (exact.length === 1) return exact[0]?.id;
  return exact.length === 0 ? idOf(text) : undefined;
}

/** whether the filter leaves rows out, for the text of an empty list */
export const isFiltered = (filter: PvpFilter, tab: PvpTab) =>
  filter.name.trim() !== '' || filter.onlyPlunder || filter.onlyNoAttack || (tab === 'battles' && filter.withPlunder);

/** what the box does on a click; the tabs add nothing of their own */
export interface PvpActions extends Pick<PvpRowActions, 'plunderPlayer' | 'noAttackPlayer'> {
  tab(tab: PvpTab): void;
  filter(patch: Partial<PvpFilter>): void;
  /** the funnel: puts the name into the name field, as if typed; an empty name clears it */
  pickPlayer(name: string): void;
  /** selects a battle for the side panel, or clears the selection when it is the selected one */
  select(battleId: number): void;
  /** folds the side panel of the selected battle in or out */
  togglePanel(): void;
  /** puts this player's name into the field and opens their note for typing */
  note(opponent: PlayerId): void;
  /** moves the row window by rows, down for positive */
  scroll(rows: number): void;
  /** gets the table area on every render, to measure how many rows fit */
  measure(area: Element | undefined): void;
}

/** what a tab turns into its view model besides the rows it loaded */
export interface ViewInput {
  filter: PvpFilter;
  lookups: PvpPlayerLookups;
  building: (id: BuildingDefId) => string | undefined;
  resourceName: (id: string) => string | undefined;
  /** the Markdown note of a player, if any */
  note: (id: PlayerId) => string | undefined;
  now: number;
  /** the battle the side panel shows */
  selected?: number;
}

/** what every tab shows around its rows */
export interface ListVm {
  /** the line above the table */
  totals: string;
  /** rows of the list over all that is not loaded */
  total: number;
  /** the index in the list of the first loaded row */
  from: number;
  empty?: 'none' | 'noMatch';
}

/** the opponent's name, as a row shows it */
export const nameOf = ({ lookups }: Pick<ViewInput, 'lookups'>, id: PlayerId) => lookups.playerName(id) || String(id);

export function listVm(list: { total: number; from: number; totals: string; filtered: boolean }): ListVm {
  return {
    totals: list.totals,
    total: list.total,
    from: list.from,
    empty: list.total > 0 ? undefined : list.filtered ? 'noMatch' : 'none',
  };
}

/** what the first cells of a row show about a player */
export interface OpponentVm {
  opponent: PlayerId;
  name: string;
  /** the name with the guild, for the tooltip */
  nameTip: string;
  /** the opponent's page at foestats */
  url: string;
  /** the opponent's note as plain text, empty when there is none */
  note: string;
  /** the PvP marks; undefined for a player the store does not know, who cannot be marked */
  plunderWorthy?: boolean;
  noAttack?: boolean;
  /** the name field names this player exactly: the funnel shows filled */
  picked: boolean;
}

export function opponentVm(input: ViewInput, id: PlayerId): OpponentVm {
  const name = nameOf(input, id);
  return {
    opponent: id,
    name,
    nameTip: nameWithGuild(name, input.lookups.playerGuild(id)?.name),
    url: input.lookups.playerUrl(id),
    note: plainText(input.note(id) ?? ''),
    plunderWorthy: input.lookups.plunderWorthy(id),
    noAttack: input.lookups.noAttack(id),
    picked: sameName(input.filter.name.trim(), name),
  };
}

/** The opponent: the name links to their page at foestats, then at the right edge the two PvP marks (only for a player
 * the store knows) and the funnel. The tooltip adds the guild. */
export const opponentCell = (r: OpponentVm, actions: PvpActions) =>
  html`<td class="name-cell" data-tip=${r.nameTip}><span class="row-name">${externalLink(r.name, r.url)}${pvpMarks(
    r,
    (value) => actions.plunderPlayer(r.opponent, value),
    (value) => actions.noAttackPlayer(r.opponent, value),
  )}${pickButton(r.name, r.picked, actions.pickPlayer)}</span></td>`;

/** a note sheet per row: dim without a note, the note as tooltip */
export const noteMarker = (opponent: PlayerId, note: string, actions: PvpActions) =>
  html`<td><button class=${note ? 'marker' : 'marker dim'} data-tip=${note || t('notes.add')}
    aria-label=${t('notes.add')} @click=${() => actions.note(opponent)}>${headerIcons.note}</button></td>`;

/** the loaded rows the window draws; `from` is the index of the first loaded row in the list, `total` the rows of
 * the list */
export const rowsShown = <R>(rows: R[], from: number, total: number, { top, below }: RowWindow): R[] => {
  const start = top - from;
  return rows.slice(Math.max(0, start), Math.max(0, start + total - top - below));
};

/** the totals, then the rows of the window with the two buttons, or the text for an empty list; `empty` has one text
 * per case */
export function listView(
  vm: ListVm,
  window: RowWindow,
  actions: PvpActions,
  empty: { none: TextKey; noMatch: TextKey },
  table: TemplateResult,
) {
  const totals = html`<p class="pvp-totals">${vm.totals}</p>`;
  if (vm.empty) return html`${totals}<p class="muted">${t(empty[vm.empty])}</p>`;
  return html`${totals}${windowedRows({ cls: 'pvp-win', table, window, scroll: actions.scroll, measure: actions.measure })}`;
}
