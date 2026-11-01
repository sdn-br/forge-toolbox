import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { BattleWithPlunder } from '../../../shared/model';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { icons } from '../../ui/icons';
import { PlayerNoteCard } from '../../ui/note-card';
import { rowWindow } from '../../ui/windowed-rows';
import { catalogUnits } from '../shared/battle-details';
import { playerLookups, playerRowActions } from '../shared/player-lookups';
import { createBattlesSection } from './battles/section';
import { prunedBy, reselect } from './battles/selection';
import { battlePanelVm } from './battles/view-model';
import { createIncomingSection } from './incoming/section';
import { KEEP_SETTING, pruneBefore } from './retention';
import {
  keepInLoaded,
  NO_FILTER,
  opponentsFor,
  type PvpActions,
  type PvpFilter,
  type PvpTab,
  pickedPlayer,
  type ViewInput,
} from './rows';
import { BATTLES_MIN_WIDTH, pvpCss } from './styles';
import type { PvpSection, PvpVm, Totals } from './tabs';
import { pvpView } from './view';

/** the menu entry and the settings group show it */
const ICON = icons.pvp;

export const OPEN_WITH_ARMY = toggleDef({
  key: 'pvp.openWithArmy',
  group: 'pvp.title',
  label: 'pvp.openWithArmy',
  default: true,
});

/** room beyond the least widths, for longer names and, on the attacks on the own city, the kind (Nutzer, 2026-11-01) */
const NAME_ROOM = 120;
/** the battles table, the body padding 16, the two scroll buttons with their gap 26 and 20 for the cell padding */
const WIDTH = BATTLES_MIN_WIDTH + 16 + 26 + 20 + NAME_ROOM;
/** rows in view: the box has a fixed size, its height follows from them (Nutzer, 2026-11-01) */
export const VISIBLE_ROWS = 12;
/** a slice holds this many windows of rows above and below the one in view, so scrolling reads only now and then */
const AHEAD = 2;
const SLICE_WINDOWS = 2 * AHEAD + 1;

export const pvpFeature: Feature = {
  id: 'pvp',
  setup(ctx) {
    ctx.settings.registerGroup('pvp.title', ICON);
    const keep = ctx.settings.register(KEEP_SETTING);
    const openWithArmy = ctx.settings.register(OPEN_WITH_ARMY);

    let vm: PvpVm | undefined;
    let tab: PvpTab = 'battles';
    let filter: PvpFilter = NO_FILTER;
    /** the index of the first row in view; the window keeps it inside the list */
    let top = 0;
    /** the battle the side panel shows, as last read; its tab stands while there is one */
    let selected: BattleWithPlunder | undefined;
    /** the tab folds the panel in and out, a new selection opens it */
    let panelOpen = true;
    /** the battles of the last load, for a click that selects one */
    let loadedBattles: BattleWithPlunder[] = [];
    /** what the view models of the last load were built with */
    let lastInput: ViewInput | undefined;
    /** the slice the last load asked for; the window loads again once it leaves it */
    let requested = { offset: 0, limit: 0 };
    /** the totals of the current query and tab, for slices read while scrolling; a change of either or new data drops them */
    let knownTotals: Totals | undefined;
    let query = 0;
    // builds the view model of the last load again, without reading
    let shown: (() => PvpVm) | undefined;
    // who the filter matched at the last load; undefined means everybody
    let opponentsShown: PlayerId[] | undefined;

    const sections: Record<PvpTab, PvpSection> = {
      battles: createBattlesSection(ctx),
      incoming: createIncomingSection(ctx),
    };
    const lookups = playerLookups(ctx);
    const players = () => ctx.players.list().filter((p) => p.world === ctx.world);
    /** the name a row shows for the player, so the field names them */
    const nameOf = (id: PlayerId) => ctx.players.get(id)?.name || String(id);

    // loads the totals of the active tab and a slice of its rows around the window
    const refresh = async () => {
      if (!box.isOpen) return;
      const current = ++query;
      const opponents = opponentsFor(filter, players());
      opponentsShown = opponents;
      const visible = VISIBLE_ROWS;
      requested = { offset: Math.max(0, top - AHEAD * visible), limit: SLICE_WINDOWS * visible };
      const { build, battles, totals } = await sections[tab].load(
        { opponents, withPlunder: filter.withPlunder },
        requested.offset,
        requested.limit,
        knownTotals,
      );
      // a newer query started meanwhile and will render
      if (current !== query) return;
      knownTotals = totals;
      const input = {
        filter,
        lookups,
        building: (id: BuildingDefId) => ctx.catalog.buildingName(id),
        resourceName: (id: string) => ctx.catalog.resourceName(id),
        unit: catalogUnits(ctx.catalog, ctx.assets),
        assetUrl: (path: string) => ctx.assets.url(path),
        note: (id: PlayerId) => ctx.notes.playerPage(id)?.text,
        now: Date.now(),
      };
      lastInput = input;
      loadedBattles = battles;
      // the selection changes without reading, the row follows it
      shown = () => build({ ...input, selected: selected?.battleId });
      vm = shown();
      if (selected) {
        const before = selected;
        selected = reselect(selected, battles, requested.offset, vm.total);
        if (selected?.battleId !== before.battleId) vm = shown();
      }
      box.update();
    };
    // events of one task (a game response often brings several) load once
    let queued = false;
    // `totals` false: only a further slice of the same query, while scrolling; its totals stay
    const show = (totals = true) => {
      if (totals) knownTotals = undefined;
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        refresh().catch((error) => logError('loading battles failed', error));
      });
    };
    // names, guilds, marks and notes are looked up when the view model is built, so a change of them needs no reading
    const rebuild = () => {
      if (shown) vm = shown();
      box.update();
    };
    // the name field and the star and warning filters turn into opponents by the player store
    const filtersByPlayers = () => filter.name.trim() !== '' || filter.onlyPlunder || filter.onlyNoAttack;
    const touches = (opponents: PlayerId[]) =>
      opponentsShown === undefined || opponents.some((o) => opponentsShown?.includes(o));
    const onRecorded = ({ opponents }: { opponents: PlayerId[] }) => {
      if (touches(opponents)) show();
    };
    // the field and the toggles show the new filter at once, the rows follow with the load
    const setFilter = (next: PvpFilter) => {
      filter = next;
      top = 0;
      // the selected battle may not be in the new list, and the list is not read whole to find out
      selected = undefined;
      rebuild();
      show();
    };
    const marks = playerRowActions(ctx);

    const actions: PvpActions = {
      tab: (next) => {
        tab = next;
        top = 0;
        selected = undefined;
        rebuild();
        show();
      },
      filter: (patch) => setFilter({ ...filter, ...patch }),
      pickPlayer: (name) => actions.filter({ name }),
      plunderPlayer: marks.plunderPlayer,
      noAttackPlayer: marks.noAttackPlayer,
      select: (battleId) => {
        selected = selected?.battleId === battleId ? undefined : loadedBattles.find((b) => b.battleId === battleId);
        if (selected) panelOpen = true;
        // the battles of the slice are loaded already
        rebuild();
      },
      togglePanel: () => {
        panelOpen = !panelOpen;
        box.update();
      },
      note: (opponent) => {
        actions.filter({ name: nameOf(opponent) });
        card.edit(opponent);
      },
      scroll: (rows) => {
        top = vm ? keepInLoaded(top + rows, VISIBLE_ROWS, vm.from, vm.rows.length) : top + rows;
        box.update();
      },
    };

    const render = () => {
      const picked = filter.name.trim() ? pickedPlayer(filter.name, players()) : undefined;
      const note = picked === undefined ? undefined : card.render(picked, ctx.players.get(picked)?.name);
      const side = selected && lastInput && { open: panelOpen, selected: battlePanelVm(selected, lastInput) };
      if (!vm) return pvpView(tab, filter, undefined, actions, note, side);
      const visible = VISIBLE_ROWS;
      const rows = rowWindow(top, vm.total, visible);
      top = rows.top;
      // the window left the slice asked for, or less than a window of loaded rows is left before it on either side with
      // more beyond: read the next slice around it, without the totals
      const end = requested.offset + requested.limit;
      const loadedEnd = vm.from + vm.rows.length;
      // no slice on the way; one shorter than asked holds the end of the list, so below it there is nothing to read,
      // above it there may be
      const settled = requested.offset === vm.from;
      const nearStart = top - vm.from < visible && vm.from > 0;
      const nearEnd =
        loadedEnd - (top + visible) < visible && loadedEnd < vm.total && vm.rows.length === requested.limit;
      if (
        vm.total > 0 &&
        (top < requested.offset || (top + visible > end && end < vm.total) || (settled && (nearStart || nearEnd)))
      )
        show(false);
      return pvpView(tab, filter, { vm, window: rows }, actions, note, side);
    };

    const box = ctx.createBox({
      id: 'pvp',
      css: pvpCss,
      settings: 'pvp.title',
      title: () => t('pvp.title'),
      width: WIDTH,
      // a fixed size: the width of the table, the height of a fixed number of rows; resizing would add nothing
      render,
    });
    const card = new PlayerNoteCard(ctx.notes, () => box.update());

    const prune = () => {
      const before = pruneBefore(keep.get(), Date.now());
      if (before === undefined) return;
      Promise.all([ctx.battles.prune(before), ctx.plunders.prune(before), ctx.incoming.prune(before)])
        .then((deleted) => {
          if (selected && prunedBy(selected, before)) {
            selected = undefined;
            rebuild();
          }
          if (deleted.some((n) => n > 0)) show();
        })
        .catch((error) => logError('pruning battles, plunders and attacks failed', error));
    };
    ctx.bus.on('session.started', prune);
    keep.onChange(prune);

    // The game traffic names no opponent before the battle starts, so the box opens on the battles to search them
    // there. When the page module reads the opponent from the game engine, the box shows that opponent alone.
    ctx.bus.on('army.opened', ({ battleType }) => {
      if (battleType !== 'pvp' || !openWithArmy.get()) return;
      box.open();
      actions.tab('battles');
    });
    ctx.bus.on('army.target', ({ opponent }) => {
      if (!box.isOpen || !openWithArmy.get()) return;
      setFilter({ ...NO_FILTER, name: nameOf(opponent) });
    });
    ctx.bus.on('battle.recorded', onRecorded);
    ctx.bus.on('plunder.recorded', onRecorded);
    ctx.bus.on('incoming.recorded', onRecorded);
    // a changed name or PvP mark can change who the filter matches
    ctx.bus.on('player.updated', () => (filtersByPlayers() ? show() : rebuild()));
    // the markers in the rows show the notes
    ctx.bus.on('note.changed', rebuild);
    // the unit portraits in the side panel are looked up when it is built
    ctx.bus.on('assets.loaded', rebuild);
    // building names the game had not loaded come from the CDN after the rows are built
    ctx.bus.on('catalog.updated', rebuild);
    ctx.menu.add({
      id: 'pvp',
      icon: ICON,
      label: () => t('menu.pvp'),
      action: () => {
        box.toggle();
        show();
      },
    });
  },
};
