// The section "Mögliche Einzahlungen" of the box: the last great building list of another player and which of its
// buildings may pay a place.
import type { TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../../shared/ids';
import type { KnownGreatBuilding } from '../../../../shared/model';
import type { FeatureContext } from '../../../core/feature';
import { logError } from '../../../core/log';
import type { Setting } from '../../../core/settings';
import { type SnipeList, snipeList } from '../../../domain/gb-snipe';
import type { Box } from '../../../ui/box';
import { nextSort } from '../../../ui/sortable';
import { createChime } from '../../../ui/sound';
import { gbRowActions, ignores } from '../../shared/gb-lookups';
import type { FoldShow } from '../fold-state';
import type { GbShared } from '../lookups';
import { type SnipeActions, snipeView } from './view';
import {
  clampScroll,
  DEFAULT_SORT,
  type ListedOwner,
  SNIPE_DESC_FIRST,
  type SnipeSort,
  type SnipeVm,
  snipeViewModel,
} from './view-model';

/** the snipe section shows the rows of ignored buildings and owners; a view choice, saved as 'true' or 'false' */
const SNIPE_SHOW_IGNORED = 'snipe.showIgnored';

export interface SnipeSettings {
  open: Setting<boolean>;
  sound: Setting<boolean>;
}

export interface SnipeHooks {
  /** redraws both sections */
  refresh(): void;
  /** a new list replaces the shown one, before it is read; the fold rules hang here */
  listArrived(): void;
  /** a click on the fold line */
  toggle(): void;
  /** plays the sound for a list with hits */
  tone(): void;
}

export interface SnipeSection {
  /** the owner of the shown list; missing before the first one */
  listOwner(): PlayerId | undefined;
  /** the section has a list to show */
  hasList(): boolean;
  /** computes the view of the section anew; the caller redraws the box */
  update(shared: GbShared): void;
  render(show: FoldShow): TemplateResult | '';
}

export function createSnipeSection(
  ctx: FeatureContext,
  box: Box,
  settings: SnipeSettings,
  hooks: SnipeHooks,
): SnipeSection {
  /** the last list of another player, with the stored state of its buildings */
  let list: (ListedOwner & { entityIds: Set<number> }) | undefined;
  let listed: KnownGreatBuilding[] = [];
  let snipe: SnipeList | undefined;
  let vm: SnipeVm = { kind: 'none' };
  let sort: SnipeSort = DEFAULT_SORT;
  let showIgnored = ctx.ui.pref(SNIPE_SHOW_IGNORED) === 'true';
  /** index of the first table row in view; a new list starts at the top, redraws of the same list keep it */
  let scroll = 0;
  /** keyed by the hits of the list: the same hits stay quiet */
  const chime = createChime(hooks.tone);
  let loads = 0;

  const actions: SnipeActions = {
    sort: (column, append) => {
      sort = nextSort(sort, column, SNIPE_DESC_FIRST, append);
      hooks.refresh();
    },
    scroll: (rows) => {
      const rowCount = vm.kind === 'list' ? vm.rows.length : 0;
      scroll = clampScroll(scroll + rows, rowCount);
      hooks.refresh();
    },
    toggle: hooks.toggle,
    ...gbRowActions(ctx),
    showIgnored: (show) => {
      showIgnored = show;
      ctx.ui.savePref(SNIPE_SHOW_IGNORED, String(show));
      hooks.refresh();
    },
  };

  /** reads the stored state of the buildings of the list; a stale answer is dropped */
  const loadList = async () => {
    const current = list;
    if (!current) return false;
    const load = ++loads;
    const known = await ctx.greatBuildings.known(current.owner);
    if (load !== loads || list !== current) return false;
    listed = known.filter((b) => current.entityIds.has(b.entityId));
    hooks.refresh();
    return true;
  };

  /** a new list: open the box when something pays, once per set of hits a tone */
  const onList = async () => {
    if (!(await loadList()) || !snipe) return;
    // ignored buildings and owners are no reason to open the box or to beep
    const hits = snipe.hits.filter((h) => !ignores(ctx, h.owner, h.entityId));
    if (hits.length === 0) return;
    const key = `${list?.owner}|${hits.map((h) => `${h.entityId}:${h.tier}:${h.place.rank}:${h.place.cost}`).join(',')}`;
    if (settings.open.get()) box.open();
    chime.ring(key, settings.sound.get());
  };

  ctx.bus.on('greatBuildings.listed', ({ owner, entityIds, at, askedByGame }) => {
    // the game asked for the list itself, the player did not open it, so it leaves the box alone
    if (askedByGame) return;
    list = { owner, at, entityIds: new Set(entityIds) };
    listed = [];
    scroll = 0;
    hooks.listArrived();
    onList().catch((error) => logError('reading the great building list failed', error));
  });
  /** the stored state of a building of the list changed: opened or changed in the game */
  const listChanged = (owner: PlayerId, entityId: number) => {
    if (list?.owner === owner && list.entityIds.has(entityId))
      loadList().catch((error) => logError('reading the great building list failed', error));
  };
  ctx.bus.on('greatBuilding.opened', ({ owner, entityId, own }) => {
    if (!own) listChanged(owner, entityId);
  });
  ctx.bus.on('greatBuilding.changed', ({ owner, entityId }) => listChanged(owner, entityId));

  return {
    listOwner: () => list?.owner,
    hasList: () => vm.kind !== 'none',
    update: ({ lookups, greatBuilding, arcBonus, now }) => {
      snipe = list && snipeList({ buildings: listed, greatBuilding, arcBonus });
      vm = snipeViewModel({ ...lookups, list, result: snipe, showIgnored, now, sort, scroll });
    },
    render: (show) => snipeView(vm, actions, show !== 'folded', show !== 'alone'),
  };
}
