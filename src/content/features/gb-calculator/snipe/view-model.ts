import type { PlayerId } from '../../../../shared/ids';
import { formatNumber, signed, t } from '../../../core/texts';
import { bySnipeProfit, type SnipeHit, type SnipeList } from '../../../domain/gb-snipe';
import { type ActivityVm, activityVm } from '../../../ui/activity';
import { type ProgressVm, progressVm } from '../../../ui/fp-bar';
import { countsIgnored, ignoreNote } from '../../../ui/ignore';
import { type OwnerVm, ownerVm } from '../../../ui/owner-line';
import { type HitVm, hitSortKeys, hitVm, ownerShareNote, snipeNotes } from '../../../ui/snipe-hit';
import { type Sort, sortRows } from '../../../ui/sortable';
import { clampTop, type RowWindow, rowWindow } from '../../../ui/windowed-rows';
import type { GbCalcLookups } from '../lookups';

export type SnipeColumn = 'order' | 'name' | 'level' | 'progress' | 'rank' | 'cost' | 'profit' | 'tier' | 'mark';

export type SnipeSort = Sort<SnipeColumn>;

/** profit first, the best on top */
export const DEFAULT_SORT: SnipeSort = [{ column: 'profit', desc: true }];

/** names and the game's order read from the top, numbers from the largest */
export const SNIPE_DESC_FIRST: ReadonlySet<SnipeColumn> = new Set([
  'level',
  'progress',
  'rank',
  'cost',
  'profit',
  'tier',
  'mark',
]);

/** rows of the table in view at once; the rest scrolls */
export const VISIBLE_ROWS = 6;

/** the offset kept inside the list, so a shorter list or a stale offset never leaves the table empty */
export const clampScroll = (top: number, rows: number): number => clampTop(top, rows, VISIBLE_ROWS);

/** the progress of the level for its cell */
export interface SnipeRowVm extends ProgressVm {
  owner: PlayerId;
  entityId: number;
  /** place in the game's list, from 1 */
  order: number;
  name: string;
  level: number;
  /** "300" when the building gained Forge points since its previous sighting on this level */
  growth?: string;
  /** the best place */
  hit: HitVm;
  /** the player put a star on the building */
  marked: boolean;
  /** the building itself is ignored, for its eye; the note also names an ignored owner */
  ignored: boolean;
  /** why the row counts as ignored, in words; missing when it does not. Such rows show muted */
  ignoreNote?: string;
  /** lines of the row tooltip */
  notes: string[];
  /** what the owner paid in, for the progress tooltip; missing when unknown */
  ownerShare?: string;
}

export type SnipeVm =
  | { kind: 'none' }
  | (OwnerVm & {
      kind: 'list';
      /** the player the list belongs to, with the foestats link and activity as on the LG tab */
      ownerId: PlayerId;
      activity?: ActivityVm;
      /** when the list came; the view shows its age as of drawing */
      at: number;
      sort: SnipeSort;
      rows: SnipeRowVm[];
      /** which rows of `rows` are in view */
      scroll: RowWindow;
      /** the hit with the highest profit among the not ignored ones, whatever the sort; missing without such hits */
      best?: { name: string; profit: string };
      /** hits that are not ignored: what the summary counts */
      hitCount: number;
      /** hits of ignored buildings and owners, shown or not */
      ignoredCount: number;
      /** also the rows of ignored buildings and owners, drawn muted */
      showIgnored: boolean;
      /** counts under the table, those that are 0 left out */
      counts: string[];
    });

/** the last list of another player: its owner, when it came and its buildings in the game's order */
export interface ListedOwner {
  owner: PlayerId;
  ownerName?: string;
  at: number;
  entityIds: Iterable<number>;
}

export interface SnipeInput extends GbCalcLookups {
  /** the list shown; missing before the first one */
  list?: ListedOwner;
  result?: SnipeList;
  /** the rows of ignored buildings and owners show, muted */
  showIgnored: boolean;
  /** the time the age in a row tooltip counts to */
  now: number;
  sort: SnipeSort;
  /** index of the first row in view; default the top */
  scroll?: number;
}

type Built = SnipeRowVm & { source: SnipeHit };

const sortKey: Record<SnipeColumn, (r: Built) => number | string | undefined> = {
  order: (r) => r.order,
  name: (r) => r.name,
  level: (r) => r.level,
  ...hitSortKeys<Built>(
    (r) => r.source,
    (r) => r.source,
  ),
  mark: (r) => Number(r.marked),
};

export function snipeViewModel(input: SnipeInput): SnipeVm {
  const { list, result } = input;
  if (!list || !result) return { kind: 'none' };
  const name = (h: SnipeHit) => input.greatBuildingName(h.cityEntityId) ?? h.cityEntityId;
  const places = new Map([...list.entityIds].map((id, i) => [id, i + 1]));
  const kept = result.hits.filter(
    (h) => !countsIgnored(input.isIgnored(h.owner, h.entityId), input.ownerIgnored(h.owner)),
  );
  const built = (input.showIgnored ? result.hits : kept).map((h) => {
    const ignored = input.isIgnored(h.owner, h.entityId);
    const ownerShare = ownerShareNote(h.ownerShare, input.now);
    const row: SnipeRowVm = {
      owner: h.owner,
      entityId: h.entityId,
      order: places.get(h.entityId) ?? 0,
      name: name(h),
      level: h.level,
      ...progressVm(h.invested, h.required),
      ...(h.growth !== undefined && { growth: formatNumber(h.growth) }),
      hit: hitVm(h),
      marked: input.isMarked(h.owner, h.entityId),
      ignored,
      ...ignoreNote(ignored, input.ownerIgnored(h.owner)),
      notes: snipeNotes(h),
      ...(ownerShare !== undefined && { ownerShare }),
    };
    return { ...row, source: h };
  });
  const rows = sortRows(built, input.sort, (column) => sortKey[column]).map(({ source: _, ...row }) => row);
  const counts = [
    result.none > 0 && t('snipe.countNone', { count: result.none }),
    result.ownContribution > 0 && t('snipe.countOwn', { count: result.ownContribution }),
    result.unknownReward > 0 && t('snipe.countUnknown', { count: result.unknownReward }),
    result.hits.length > kept.length && t('snipe.countIgnored', { count: result.hits.length - kept.length }),
  ].filter((c): c is string => typeof c === 'string');
  const best = [...kept].sort(bySnipeProfit)[0];
  const activity = activityVm(input.foestats(list.owner), input.today);
  return {
    kind: 'list',
    ...ownerVm(input, list.owner, list.ownerName ?? input.playerName(list.owner) ?? String(list.owner)),
    ownerId: list.owner,
    ...(activity && { activity }),
    at: list.at,
    sort: input.sort,
    rows,
    scroll: rowWindow(input.scroll ?? 0, rows.length, VISIBLE_ROWS),
    ...(best && { best: { name: name(best), profit: signed(best.profitHigh) } }),
    counts,
    hitCount: kept.length,
    ignoredCount: result.hits.length - kept.length,
    showIgnored: input.showIgnored,
  };
}
