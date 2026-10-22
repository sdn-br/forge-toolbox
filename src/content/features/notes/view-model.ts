import { foestatsGuildUrl, foestatsPlayerUrl } from '../../../shared/foestats';
import type { PlayerId, WorldId } from '../../../shared/ids';
import type { NoteGroup, NotePage, Player, Relations } from '../../../shared/model';
import { formatWhen, t } from '../../core/texts';
import { PLAYER_GROUP, playerOfPage, playerPageId } from '../../stores/notes';
import { plainText } from '../../ui/markdown';

export type RelationFilter = 'all' | keyof Relations | 'other';
export const RELATION_FILTERS: RelationFilter[] = ['all', 'neighbor', 'guildMember', 'friend', 'other'];

/** The state of the box that is not in the store. It is not persisted. */
export interface NotesUi {
  group: string;
  /** the active page; in the player group the page id of a player, whose page may not exist yet */
  page?: string;
  search: string;
  relation: RelationFilter;
  /** search text of the player picker while it is open */
  picker?: string;
  addingGroup: boolean;
  renaming?: { kind: 'group' | 'page'; id: string };
  confirm?: { kind: 'group' | 'page'; id: string };
}

export const PICKER_ROWS = 50;
const SNIPPET = 90;

export interface TabVm {
  id: string;
  name: string;
  active: boolean;
  /** the player group: not renamed, deleted or moved */
  fixed: boolean;
  renaming: boolean;
}

export interface RowVm {
  id: string;
  title: string;
  when: string;
  active: boolean;
  renaming: boolean;
  /** relation icons of a player page */
  icons: string;
  /** a player page that exists only as the selection, not stored yet */
  draft: boolean;
}

export interface PlayerVm {
  id: PlayerId;
  name: string;
  /** the player's page at foestats */
  url: string;
  guild?: { name: string; url: string };
  icons: string;
}

export interface PageVm {
  id: string;
  title: string;
  text: string;
  when?: string;
  player?: PlayerVm;
  stored: boolean;
}

export interface ResultVm {
  group: string;
  page: string;
  groupName: string;
  title: string;
  snippet: string;
}

export interface PickerVm {
  text: string;
  rows: { id: PlayerId; name: string; guild?: string; hasPage: boolean }[];
  more: boolean;
}

export interface NotesVm {
  tabs: TabVm[];
  addingGroup: boolean;
  search: string;
  /** only while searching */
  results?: ResultVm[];
  playerGroup: boolean;
  relation: RelationFilter;
  rows: RowVm[];
  empty?: 'noPages' | 'noPlayerPages' | 'noPlayerMatch';
  page?: PageVm;
  /** the question of a pending delete */
  confirm?: string;
  picker?: PickerVm;
}

export interface NotesInput {
  ui: NotesUi;
  world: WorldId;
  groups: NoteGroup[];
  /** all pages of the world */
  pages: NotePage[];
  player: (id: PlayerId) => Player | undefined;
  /** the players the picker offers */
  players: Player[];
  /** the session player, never offered in the picker */
  me?: PlayerId;
  now: number;
}

/** "🏘️🛡️🤝" for neighbour, guild member and friend */
export function relationIcons(r: Relations | undefined): string {
  if (!r) return '';
  return `${r.neighbor ? '🏘️' : ''}${r.guildMember ? '🛡️' : ''}${r.friend ? '🤝' : ''}`;
}

/** players without any known relation count as other */
export function matchesRelation(filter: RelationFilter, r: Relations | undefined): boolean {
  if (filter === 'all') return true;
  if (filter === 'other') return !r || (!r.neighbor && !r.guildMember && !r.friend);
  return r?.[filter] === true;
}

/** a short piece of the plain text around the first match, or its start */
export function snippet(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = query ? flat.toLowerCase().indexOf(query) : -1;
  const from = at > 30 ? at - 30 : 0;
  const piece = flat.slice(from, from + SNIPPET);
  return `${from > 0 ? '…' : ''}${piece}${from + SNIPPET < flat.length ? '…' : ''}`;
}

export function notesViewModel(input: NotesInput): NotesVm {
  const { ui, groups, pages, player, now } = input;
  const nameOf = (page: NotePage) =>
    page.player === undefined ? page.title : player(page.player)?.name || page.title || String(page.player);
  const groupId = ui.group === PLAYER_GROUP || groups.some((g) => g.id === ui.group) ? ui.group : PLAYER_GROUP;
  const playerGroup = groupId === PLAYER_GROUP;

  const tabs: TabVm[] = [
    { id: PLAYER_GROUP, name: t('notes.players'), active: playerGroup, fixed: true, renaming: false },
    ...groups.map((g) => ({
      id: g.id,
      name: g.name,
      active: g.id === groupId,
      fixed: false,
      renaming: ui.renaming?.kind === 'group' && ui.renaming.id === g.id,
    })),
  ];

  // the page list of the active group; player pages by name, the selected player even without a page
  let listed: NotePage[];
  let draftPlayer: PlayerId | undefined;
  if (playerGroup) {
    listed = pages.filter(
      (p) => p.group === PLAYER_GROUP && matchesRelation(ui.relation, player(p.player as PlayerId)?.relations),
    );
    const selected = playerOfPage(ui.page);
    if (selected !== undefined && !pages.some((p) => p.player === selected)) draftPlayer = selected;
  } else {
    listed = pages.filter((p) => p.group === groupId).sort((a, b) => a.sort - b.sort);
  }
  const rows: RowVm[] = listed.map((p) => ({
    id: p.id,
    title: nameOf(p),
    when: formatWhen(p.updatedAt, now),
    active: false,
    renaming: ui.renaming?.kind === 'page' && ui.renaming.id === p.id,
    icons: p.player === undefined ? '' : relationIcons(player(p.player)?.relations),
    draft: false,
  }));
  if (draftPlayer !== undefined) {
    const known = player(draftPlayer);
    rows.push({
      id: playerPageId(draftPlayer),
      title: known?.name ?? String(draftPlayer),
      when: '',
      active: false,
      renaming: false,
      icons: relationIcons(known?.relations),
      draft: true,
    });
  }
  if (playerGroup) rows.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));
  const activeId = rows.some((r) => r.id === ui.page) ? ui.page : rows[0]?.id;
  for (const r of rows) r.active = r.id === activeId;

  const vm: NotesVm = {
    tabs,
    addingGroup: ui.addingGroup,
    search: ui.search,
    playerGroup,
    relation: ui.relation,
    rows,
    page: activeId === undefined ? undefined : pageVm(activeId),
  };
  if (rows.length === 0) {
    const anyPlayerPage = pages.some((p) => p.group === PLAYER_GROUP);
    vm.empty = !playerGroup ? 'noPages' : anyPlayerPage ? 'noPlayerMatch' : 'noPlayerPages';
  }

  const query = ui.search.trim().toLowerCase();
  if (query) vm.results = search(query);
  if (ui.confirm) vm.confirm = confirmQuestion(ui.confirm);
  if (ui.picker !== undefined) vm.picker = picker(ui.picker);
  return vm;

  function pageVm(id: string): PageVm {
    const page = pages.find((p) => p.id === id);
    const playerId = page?.player ?? playerOfPage(id);
    if (playerId === undefined) {
      const p = page as NotePage;
      return { id, title: p.title, text: p.text, when: formatWhen(p.updatedAt, now), stored: true };
    }
    const known = player(playerId);
    const name = known?.name || page?.title || String(playerId);
    return {
      id,
      title: name,
      text: page?.text ?? '',
      when: page && formatWhen(page.updatedAt, now),
      stored: page !== undefined,
      player: {
        id: playerId,
        name,
        url: foestatsPlayerUrl(input.world, playerId),
        ...(known?.guild && {
          guild: { name: known.guild.name, url: foestatsGuildUrl(input.world, known.guild.id) },
        }),
        icons: relationIcons(known?.relations),
      },
    };
  }

  function search(q: string): ResultVm[] {
    const groupName = (id: string) =>
      id === PLAYER_GROUP ? t('notes.players') : (groups.find((g) => g.id === id)?.name ?? '');
    return pages
      .map((p) => ({ p, title: nameOf(p), text: plainText(p.text) }))
      .filter(({ title, text }) => title.toLowerCase().includes(q) || text.toLowerCase().includes(q))
      .sort((a, b) => b.p.updatedAt - a.p.updatedAt)
      .map(({ p, title, text }) => ({
        group: p.group,
        page: p.id,
        groupName: groupName(p.group),
        title,
        snippet: snippet(text, text.toLowerCase().includes(q) ? q : ''),
      }));
  }

  function confirmQuestion(c: NonNullable<NotesUi['confirm']>): string | undefined {
    if (c.kind === 'page') {
      const page = pages.find((p) => p.id === c.id);
      return page && t('notes.confirmPage', { title: nameOf(page) });
    }
    const group = groups.find((g) => g.id === c.id);
    if (!group) return undefined;
    const count = pages.filter((p) => p.group === c.id).length;
    if (count === 0) return t('notes.confirmGroupEmpty', { name: group.name });
    if (count === 1) return t('notes.confirmGroupOne', { name: group.name });
    return t('notes.confirmGroup', { name: group.name, count });
  }

  function picker(text: string): PickerVm {
    const q = text.trim().toLowerCase();
    const withPage = new Set(pages.flatMap((p) => (p.player === undefined ? [] : [p.player])));
    const matches = input.players
      .filter((p) => p.id !== input.me && (!q || p.name.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          Number(withPage.has(b.id)) - Number(withPage.has(a.id)) ||
          a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
      );
    return {
      text,
      rows: matches
        .slice(0, PICKER_ROWS)
        .map((p) => ({ id: p.id, name: p.name, guild: p.guild?.name, hasPage: withPage.has(p.id) })),
      more: matches.length > PICKER_ROWS,
    };
  }
}
