// What both investment tabs share about their rows: the common filters, how a row gets its names, stars and eyes, the
// fields every row shows and the columns both sort the same way.

import type { TemplateResult } from 'lit-html';
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { FeatureContext } from '../../core/feature';
import { formatNumber, t, textFilter } from '../../core/texts';
import { ALL_REACH, passesReach, REACH_ORDER, type Reach, type ReachFilter, reasonsOf } from '../../domain/reach';
import type { Box } from '../../ui/box';
import { type ProgressVm, progressVm } from '../../ui/fp-bar';
import { ignoreNote } from '../../ui/ignore';
import { nextSort, type Sort } from '../../ui/sortable';
import { prefRecord } from '../../ui/ui-state';
import type { RowWindow } from '../../ui/windowed-rows';
import { type GbLookups, type GbRowActions, gbRowActions } from '../shared/gb-lookups';

/** the first three on: what the former checkbox "only reachable" meant */
export const DEFAULT_REACH: ReachFilter = { neighbor: true, friend: true, guildMember: true, none: false };

/** every reason as words, or why there is none */
export const reachTip = (reasons: Reach[]) => {
  const [first] = reasons;
  if (first === 'none' || first === 'unknown') return t(`investments.reachHint.${first}`);
  return reasons.map((r) => t(`investments.reach.${r}`)).join(', ');
};

/** the former checkbox "only reachable": on was the default, off let all four through; reasons saved since then win */
export const migrateReach = (saved: Record<string, unknown>): Record<string, unknown> =>
  saved.onlyReachable === false
    ? {
        ...saved,
        reach: { ...ALL_REACH, ...(typeof saved.reach === 'object' && saved.reach !== null ? saved.reach : {}) },
      }
    : saved;

/** what the box gives a tab for each draw */
export interface TabFrame {
  lookups: GbLookups;
  /** rows that fit into the table area */
  visible: number;
  now: number;
}

/** what the rows of either tab are narrowed to; a view choice of the viewer, each tab keeps its own */
export interface CommonFilter {
  /** part of the owner's name */
  player: string;
  /** part of the building's name */
  name: string;
  /** which reasons let a row through; owners the player store does not know always pass */
  reach: ReachFilter;
  /** only buildings the player marked and buildings of marked owners */
  onlyMarked: boolean;
  /** also the rows of ignored buildings and owners, drawn muted */
  showIgnored: boolean;
}

/** what a row of either tab is about: a level of a building of a player */
export interface RowBuilding {
  owner: PlayerId;
  entityId: number;
  cityEntityId: BuildingDefId;
  level: number;
  invested: number;
  required: number;
  growth?: number;
}

/** what the lookups say about a row: names, relation, stars and eyes */
export interface RowNames {
  ownerName: string;
  name: string;
  reasons: Reach[];
  marked: boolean;
  ownerMarked: boolean;
  ignored: boolean;
  ownerIgnored: boolean | undefined;
}

export const rowNames = (input: GbLookups, b: RowBuilding): RowNames => ({
  ownerName: input.playerName(b.owner) ?? String(b.owner),
  name: input.greatBuildingName(b.cityEntityId) ?? b.cityEntityId,
  reasons: reasonsOf(input.relations(b.owner)),
  marked: input.isMarked(b.owner, b.entityId),
  ownerMarked: input.playerMarked(b.owner) === true,
  ignored: input.isIgnored(b.owner, b.entityId),
  ownerIgnored: input.ownerIgnored(b.owner),
});

/** the common filters but `showIgnored`, which each tab counts in its own way */
export const passesCommon = (filter: CommonFilter) => {
  const byPlayer = textFilter(filter.player);
  const byName = textFilter(filter.name);
  return (r: RowNames) =>
    byPlayer(r.ownerName) &&
    byName(r.name) &&
    passesReach(r.reasons, filter.reach) &&
    (!filter.onlyMarked || r.marked || r.ownerMarked);
};

/** the columns both tabs sort by the names of a row */
export type NamedColumn = 'mark' | 'owner' | 'reach' | 'name';

export const namedSortKeys = <R extends RowNames>(): Record<NamedColumn, (r: R) => number | string> => ({
  mark: (r) => Number(r.marked),
  owner: (r) => r.ownerName,
  reach: (r) => REACH_ORDER.indexOf(r.reasons[0] as Reach),
  name: (r) => r.name,
});

/** the fields every row of either tab draws; the progress of the level for its cell */
export interface CommonRowVm extends ProgressVm {
  owner: PlayerId;
  entityId: number;
  /** the player put a star on the building */
  marked: boolean;
  ownerName: string;
  ownerUrl: string;
  /** the player put a star on the owner */
  ownerMarked: boolean;
  /** the player ignores the building */
  ignored: boolean;
  /** the player ignores the owner; undefined when the player store does not know the owner, who cannot be ignored */
  ownerIgnored: boolean | undefined;
  /** why the row counts as ignored, in words; missing when it does not */
  ignoreNote?: string;
  /** every reason, each drawn as its icon; a first `none` drawn muted */
  reasons: Reach[];
  /** every reason, for the tooltip */
  reachTip: string;
  name: string;
  level: number;
  /** the Forge points others paid in, as the tab explains it in the growth hint */
  growth?: string;
}

export const commonRowVm = (input: Pick<GbLookups, 'playerUrl'>, b: RowBuilding, n: RowNames): CommonRowVm => ({
  owner: b.owner,
  entityId: b.entityId,
  marked: n.marked,
  ownerName: n.ownerName,
  ownerUrl: input.playerUrl(b.owner),
  ownerMarked: n.ownerMarked,
  ignored: n.ignored,
  ownerIgnored: n.ownerIgnored,
  ...ignoreNote(n.ignored, n.ownerIgnored),
  reasons: n.reasons,
  reachTip: reachTip(n.reasons),
  name: n.name,
  level: b.level,
  ...progressVm(b.invested, b.required),
  ...(b.growth !== undefined && { growth: formatNumber(b.growth) }),
});

/** what a row of either tab does, and the table and filters around it */
export interface RowActions<C extends string, F extends CommonFilter> extends GbRowActions {
  sort(column: C, append: boolean): void;
  filter(patch: Partial<F>): void;
  /** put the owner's name into the "Spieler" filter, as if typed */
  pickPlayer(name: string): void;
  /** moves the table of the tab by rows, down for positive; the owner keeps the offset inside the list */
  scroll(rows: number): void;
  /** gets the table area on every render, to measure how many rows fit */
  measure(area: Element | undefined): void;
}

/** the view choices of a tab as its view model takes them */
export interface TabChoices<C extends string, F extends CommonFilter> {
  sort: Sort<C>;
  filter: F;
  /** the first row in view; the view model keeps it inside the list */
  scroll: number;
}

/**
 * Sort, filters and first row in view of a tab, with the actions on them; each action redraws the box. The filters are
 * saved under `prefKey`, each part that is missing or broken at its default. Returns the draw of the tab: `vm` gets the
 * choices, the first row in view it keeps comes back through its window.
 */
export function createTabState<C extends string, F extends CommonFilter>(
  ctx: FeatureContext,
  box: Box,
  measure: (area: Element | undefined) => void,
  options: { prefKey: string; defaults: F; defaultSort: Sort<C>; descFirst: ReadonlySet<C> },
) {
  let sort = options.defaultSort;
  let filter = prefRecord(options.defaults, ctx.ui.pref(options.prefKey), migrateReach);
  let scroll = 0;

  const actions: RowActions<C, F> = {
    ...gbRowActions(ctx),
    sort: (column, append) => {
      sort = nextSort(sort, column, options.descFirst, append);
      box.update();
    },
    filter: (patch) => {
      filter = { ...filter, ...patch };
      ctx.ui.savePref(options.prefKey, JSON.stringify(filter));
      box.update();
    },
    pickPlayer: (player) => actions.filter({ player } as Partial<F>),
    scroll: (rows) => {
      scroll += rows;
      box.update();
    },
    measure,
  };

  return <V extends { scroll: RowWindow }>(
    vm: (choices: TabChoices<C, F>) => V,
    view: (vm: V, actions: RowActions<C, F>) => TemplateResult,
  ): TemplateResult => {
    const drawn = vm({ sort, filter, scroll });
    scroll = drawn.scroll.top;
    return view(drawn, actions);
  };
}
