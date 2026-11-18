// What the tabs of the PvP box share: the filter, the lead cells of a row (note marker and opponent with the PvP marks
// and the funnel) and the list around the table (totals, empty text, row window).
import { html, type TemplateResult } from 'lit-html';
import { type BuildingDefId, type EraId, type PlayerId, playerId } from '../../../shared/ids';
import type { ArenaLogEntry, OpponentScope, Player } from '../../../shared/model';
import { sameName, type TextKey, t, textFilter } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { externalLink, nameWithGuild } from '../../ui/links';
import { plainText } from '../../ui/markdown';
import { pickButton } from '../../ui/pick';
import { pvpMarks } from '../../ui/pvp-marks';
import { type RowWindow, windowedRows } from '../../ui/windowed-rows';
import type { UnitInfo } from '../shared/battle-details';
import type { PvpPlayerLookups, PvpRowActions } from '../shared/player-lookups';

export type PvpTab = 'battles' | 'incoming' | 'arena';

/** which players the mark toggles show, by their PvP marks; a player with neither mark, or one the player store does
 * not know, counts as `none`. A player with both marks shows while either of them is on. */
export interface MarkFilter {
  plunder: boolean;
  noAttack: boolean;
  none: boolean;
}

/** the mark toggles in their order */
export const MARK_TOGGLES: (keyof MarkFilter)[] = ['plunder', 'noAttack', 'none'];

/** which players the mark toggles of the arena show, by its own mark; a player without it, or one the player store
 * does not know, counts as `none`. The neighbourhood marks play no part in the arena. */
export interface ArenaMarkFilter {
  noAttack: boolean;
  none: boolean;
}

/** the mark toggles of the arena in their order */
export const ARENA_MARK_TOGGLES: (keyof ArenaMarkFilter)[] = ['noAttack', 'none'];

/** which battles the sack toggles show: those with a plunder, those without one */
export interface LootFilter {
  with: boolean;
  without: boolean;
}

/** the sack toggles in their order */
export const LOOT_TOGGLES: (keyof LootFilter)[] = ['with', 'without'];

/** the two sub tabs of the arena: own attacks, defenses against others' attacks */
export type ArenaKind = ArenaLogEntry['kind'];

/** the sub tabs in their order */
export const ARENA_KINDS: ArenaKind[] = ['attack', 'defense'];

/** What the rows are narrowed to; the name field is the only state of the player filter. Each toggle shows its rows
 * while on. */
export interface PvpFilter {
  /** a name typed or written by the funnel; the exact name of a known player means that player alone */
  name: string;
  /** the battles and the attacks on the own city */
  marks: MarkFilter;
  /** the arena only, a state of its own, so a mark toggle means the same on every tab that shows it */
  arenaMarks: ArenaMarkFilter;
  /** the battles only; the attacks on the own city have no such filter */
  loot: LootFilter;
}

/** an empty name and every toggle on: every row */
export const NO_FILTER: PvpFilter = {
  name: '',
  marks: { plunder: true, noAttack: true, none: true },
  arenaMarks: { noAttack: true, none: true },
  loot: { with: true, without: true },
};

const allOn = (toggles: object) => Object.values(toggles).every(Boolean);

/** whether the mark toggles show this player; undefined for a player the store does not know */
const showsMarks = (marks: MarkFilter, player: Player | undefined) => {
  const plunder = player?.plunderWorthy === true;
  const noAttack = player?.noAttack === true;
  if (!plunder && !noAttack) return marks.none;
  return (plunder && marks.plunder) || (noAttack && marks.noAttack);
};

/** the same for the mark toggles of the arena */
const showsArenaMarks = (marks: ArenaMarkFilter, player: Player | undefined) =>
  player?.arenaNoAttack === true ? marks.noAttack : marks.none;

/** the mark toggles a tab shows: whether all are on, whether "ohne Markierung" is, and whom they show */
const markRule = (filter: PvpFilter, tab: PvpTab) =>
  tab === 'arena'
    ? {
        all: allOn(filter.arenaMarks),
        none: filter.arenaMarks.none,
        shows: (p: Player | undefined) => showsArenaMarks(filter.arenaMarks, p),
      }
    : {
        all: allOn(filter.marks),
        none: filter.marks.none,
        shows: (p: Player | undefined) => showsMarks(filter.marks, p),
      };

/** whether rows of this opponent are in the scope */
export const inScope = ({ opponents, exceptOpponents }: OpponentScope, id: PlayerId) =>
  opponents ? opponents.includes(id) : !exceptOpponents?.includes(id);

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

/**
 * The opponents a filter asks for on a tab, together with the name: no field means all, an empty list none. With a mark
 * toggle off and "ohne Markierung" on, the players the store does not know still show, so the scope leaves out the
 * known players the toggles hide instead of naming those they show. The arena goes by its own mark toggles.
 */
export function opponentsFor(filter: PvpFilter, players: Player[], tab: PvpTab = 'battles'): OpponentScope {
  const byName = named(filter.name, players);
  const marks = markRule(filter, tab);
  if (marks.all) return byName === undefined ? {} : { opponents: byName };
  if (byName !== undefined) {
    const known = new Map(players.map((p) => [p.id, p]));
    return { opponents: byName.filter((id) => marks.shows(known.get(id))) };
  }
  if (marks.none) return { exceptOpponents: players.filter((p) => !marks.shows(p)).map((p) => p.id) };
  return { opponents: players.filter((p) => marks.shows(p)).map((p) => p.id) };
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

/** whether the name field or the mark toggles of the tab narrow the players, which the player store then turns into
 * opponents */
export const filtersPlayers = (filter: PvpFilter, tab: PvpTab = 'battles') =>
  filter.name.trim() !== '' || !markRule(filter, tab).all;

/** whether the filter leaves rows out, for the text of an empty list: a name, or a toggle off */
export const isFiltered = (filter: PvpFilter, tab: PvpTab) =>
  filtersPlayers(filter, tab) || (tab === 'battles' && !allOn(filter.loot));

/** what the box does on a click; the tabs add nothing of their own */
export interface PvpActions extends Pick<PvpRowActions, 'plunderPlayer' | 'noAttackPlayer' | 'arenaNoAttackPlayer'> {
  tab(tab: PvpTab): void;
  filter(patch: Partial<PvpFilter>): void;
  /** the funnel: puts the name into the name field, as if typed; an empty name clears it */
  pickPlayer(name: string): void;
  /** switches the sub tab of the arena */
  arenaKind(kind: ArenaKind): void;
  /** folds the second side panel of the arena, the history of the points, in or out */
  toggleHistory(): void;
  /** selects a defense line of the arena for the side panel, or clears the selection when it is the selected one */
  selectDefense(opponent: PlayerId, at: number): void;
  /** selects a battle for the side panel, or clears the selection when it is the selected one */
  select(battleId: number): void;
  /** folds the side panel of the selected battle in or out */
  togglePanel(): void;
  /** puts this player's name into the field and opens their note for typing */
  note(opponent: PlayerId): void;
  /** moves the row window by rows, down for positive */
  scroll(rows: number): void;
}

/** what a tab turns into its view model besides the rows it loaded */
export interface ViewInput {
  filter: PvpFilter;
  lookups: PvpPlayerLookups;
  building: (id: BuildingDefId) => string | undefined;
  resourceName: (id: string) => string | undefined;
  /** the name of a good's era, from the catalog */
  goodEra?: (id: string) => string | undefined;
  /** the name of an era, from the catalog */
  eraName?: (id: EraId) => string | undefined;
  /** a unit type as the battle details show it, from the catalog */
  unit: (id: string) => UnitInfo | undefined;
  /** the URL of a game image on the Inno CDN, once the index is known */
  assetUrl?: (path: string) => string | undefined;
  /** the URL of a building's image on the Inno CDN, once the catalog and the index know it */
  buildingImage?: (id: BuildingDefId) => string | undefined;
  /** the Markdown note of a player, if any */
  note: (id: PlayerId) => string | undefined;
  now: number;
  /** the battle the side panel shows */
  selected?: number;
  /** the defense line of the arena the side panel shows */
  selectedDefense?: { opponent: PlayerId; at: number };
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

/** The opponent: the name links to their page at foestats, then at the right edge the marks (by default the two PvP
 * marks, only for a player the store knows) and the funnel. The tooltip adds the guild. */
export const opponentCell = (
  r: OpponentVm,
  actions: PvpActions,
  marks: TemplateResult = pvpMarks(
    r,
    (value) => actions.plunderPlayer(r.opponent, value),
    (value) => actions.noAttackPlayer(r.opponent, value),
  ),
) =>
  html`<td class="name-cell" data-tip=${r.nameTip}><span class="row-name">${externalLink(r.name, r.url)}${marks}${pickButton(
    r.name,
    r.picked,
    actions.pickPlayer,
  )}</span></td>`;

/** a note sheet per row: dim without a note, the note as tooltip */
export const noteMarker = (opponent: PlayerId, note: string, actions: PvpActions) =>
  html`<td><button class=${note ? 'marker' : 'marker dim'} data-tip=${note || t('notes.add')}
    aria-label=${t('notes.add')} @click=${() => actions.note(opponent)}>${headerIcons.note}</button></td>`;

/** the loaded rows the window draws; `from` is the index of the first loaded row in the list, `total` the rows of
 * the list */
/**
 * Where a scroll may move the window: only over rows already loaded, so it never draws fewer rows and the box keeps its
 * height. A fast wheel (touchpad) waits at the edge of the loaded rows until the next slice is there.
 */
export const keepInLoaded = (top: number, visible: number, from: number, loaded: number): number =>
  Math.min(Math.max(top, from), Math.max(from, from + loaded - visible));

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
  return html`${totals}${windowedRows({ cls: 'pvp-win', table, window, scroll: actions.scroll })}`;
}
