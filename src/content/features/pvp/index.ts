import type { BuildingDefId, EraId, PlayerId } from '../../../shared/ids';
import type { BattleWithPlunder, OpponentScope } from '../../../shared/model';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { icons } from '../../ui/icons';
import { PlayerNoteCard } from '../../ui/note-card';
import { rowWindow } from '../../ui/windowed-rows';
import { catalogUnits } from '../shared/battle-details';
import { buildingImage } from '../shared/building-image';
import { playerLookups, playerRowActions } from '../shared/player-lookups';
import { LINK_SETTING } from '../shared/settings';
import type { ArenaHistoryVm } from './arena/history';
import { createArenaSection } from './arena/section';
import { type DefensePanelVm, defensePanelVm } from './arena/view-model';
import { createBattlesSection } from './battles/section';
import { prunedBy, reselect } from './battles/selection';
import { battlePanelVm } from './battles/view-model';
import { createIncomingSection } from './incoming/section';
import { KEEP_SETTING, pruneBefore } from './retention';
import {
  type ArenaKind,
  filtersPlayers,
  inScope,
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
import { type PanelState, pvpView } from './view';

/** the menu entry and the settings group show it */
const ICON = icons.pvp;

export const OPEN_WITH_ARMY = toggleDef({
  key: 'pvp.openWithArmy',
  group: 'pvp.title',
  label: 'pvp.openWithArmy',
  default: true,
});

/** room beyond the least widths, for longer names and, on the attacks on the own city, the kind (Nutzer, 2026-11-01) */
export const OPEN_WITH_ARENA = toggleDef({
  key: 'pvp.openWithArena',
  group: 'pvp.title',
  label: 'pvp.openWithArena',
  default: true,
});

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
    const openWithArena = ctx.settings.register(OPEN_WITH_ARENA);

    let vm: PvpVm | undefined;
    let tab: PvpTab = 'battles';
    let filter: PvpFilter = NO_FILTER;
    /** the sub tab of the arena; every opening of the arena tab starts on the attacks (Nutzer, 2026-11-16) */
    let arenaKind: ArenaKind = 'attack';
    /** the defense line the side panel shows, with what the row showed of it */
    let defense: { opponent: PlayerId; at: number; panel: DefensePanelVm } | undefined;
    /** the index of the first row in view; the window keeps it inside the list */
    let top = 0;
    /** the second drawer, on the arena tab: the history of the arena points, as last read; independent of the battle panel */
    let historyOpen = false;
    let history: ArenaHistoryVm | undefined;
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
    // who the filter matched at the last load
    let scopeShown: OpponentScope = {};

    const arenaSection = createArenaSection(ctx);
    const sections: Record<PvpTab, PvpSection> = {
      battles: createBattlesSection(ctx),
      incoming: createIncomingSection(ctx),
      arena: arenaSection,
    };
    // the history reads all points and lines; a newer read wins
    let historyQuery = 0;
    const loadHistory = () => {
      if (!historyOpen || tab !== 'arena' || !box.isOpen) return;
      const current = ++historyQuery;
      arenaSection
        .history()
        .then((next) => {
          if (current !== historyQuery) return;
          history = next;
          box.update();
        })
        .catch((error) => logError('loading the arena history failed', error));
    };
    const lookups = playerLookups(ctx);
    const players = () => ctx.players.list().filter((p) => p.world === ctx.world);
    /** the name a row shows for the player, so the field names them */
    const nameOf = (id: PlayerId) => ctx.players.get(id)?.name || String(id);

    // loads the totals of the active tab and a slice of its rows around the window
    const refresh = async () => {
      if (!box.isOpen) return;
      const current = ++query;
      const scope = opponentsFor(filter, players(), tab);
      scopeShown = scope;
      const visible = VISIBLE_ROWS;
      requested = { offset: Math.max(0, top - AHEAD * visible), limit: SLICE_WINDOWS * visible };
      const { build, battles, totals } = await sections[tab].load(
        { scope, loot: filter.loot, arenaKind },
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
        eraName: (id: EraId) => ctx.catalog.eraName(id),
        goodEra: (id: string) => ctx.catalog.goodEraName(id),
        unit: catalogUnits(ctx.catalog, ctx.assets),
        assetUrl: (path: string) => ctx.assets.url(path),
        buildingImage: (id: BuildingDefId) => buildingImage(ctx.catalog, ctx.assets, id),
        note: (id: PlayerId) => ctx.notes.playerPage(id)?.text,
        now: Date.now(),
      };
      lastInput = input;
      loadedBattles = battles;
      // the selection changes without reading, the row follows it
      shown = () => build({ ...input, selected: selected?.battleId, ...(defense && { selectedDefense: defense }) });
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
    // a closed box builds nothing: opening reads the rows again and builds with the data of that moment
    const rebuild = () => {
      if (!box.isOpen) return;
      if (shown) vm = shown();
      box.update();
    };
    const touches = (opponents: PlayerId[]) => opponents.some((o) => inScope(scopeShown, o));
    const onRecorded = ({ opponents }: { opponents: PlayerId[] }) => {
      if (touches(opponents)) show();
    };
    // the field and the toggles show the new filter at once, the rows follow with the load
    const setFilter = (next: PvpFilter) => {
      filter = next;
      top = 0;
      // the selected battle may not be in the new list, and the list is not read whole to find out
      selected = undefined;
      defense = undefined;
      rebuild();
      show();
    };
    const marks = playerRowActions(ctx);

    const actions: PvpActions = {
      tab: (next) => {
        tab = next;
        arenaKind = 'attack';
        top = 0;
        selected = undefined;
        defense = undefined;
        rebuild();
        show();
        // the history keeps its open state while another tab hides it
        loadHistory();
      },
      arenaKind: (next) => {
        arenaKind = next;
        top = 0;
        selected = undefined;
        defense = undefined;
        rebuild();
        show();
      },
      toggleHistory: () => {
        historyOpen = !historyOpen;
        box.update();
        loadHistory();
      },
      selectDefense: (opponent, at) => {
        const same = defense?.opponent === opponent && defense.at === at;
        const row = vm?.tab === 'arena' ? vm.rows.find((r) => r.opponent === opponent && r.at === at) : undefined;
        defense =
          same || !row ? undefined : { opponent, at, panel: defensePanelVm(row, lookups.playerGuild(opponent)) };
        if (defense) panelOpen = true;
        rebuild();
      },
      filter: (patch) => setFilter({ ...filter, ...patch }),
      pickPlayer: (name) => actions.filter({ name }),
      plunderPlayer: marks.plunderPlayer,
      noAttackPlayer: marks.noAttackPlayer,
      arenaNoAttackPlayer: marks.arenaNoAttackPlayer,
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
      const historyState = { open: historyOpen, ...(history && { vm: history }) };
      const side: PanelState | undefined =
        defense && tab === 'arena'
          ? { open: panelOpen, defense: defense.panel }
          : selected && lastInput
            ? { open: panelOpen, selected: battlePanelVm(selected, lastInput) }
            : undefined;
      if (!vm) return pvpView(tab, filter, undefined, actions, note, side, arenaKind, historyState);
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
      return pvpView(tab, filter, { vm, window: rows }, actions, note, side, arenaKind, historyState);
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
      Promise.all([ctx.battles.prune(before, ctx.plunders), ctx.incoming.prune(before)])
        .then((deleted) => {
          if (selected && prunedBy(selected, before)) {
            selected = undefined;
            rebuild();
          }
          if (deleted.some((n) => n > 0)) show();
        })
        .catch((error) => logError('pruning battles, plunders and attacks failed', error));
      // the arena keeps its rows as long as the neighbourhood
      ctx.arena
        .prune(before)
        .then((deleted) => {
          if (deleted > 0) show();
        })
        .catch((error) => logError('pruning the arena failed', error));
    };
    ctx.bus.on('session.started', prune);
    keep.onChange(prune);
    // the links of the names follow the chosen site
    ctx.settings.onChange((key) => {
      if (key === LINK_SETTING.key) rebuild();
    });

    // The game traffic names no opponent before the battle starts, so the box opens on the battles to search them
    // there. When the page module reads the opponent from the game engine, the box shows that opponent alone.
    ctx.bus.on('army.opened', ({ kind }) => {
      if (kind !== 'pvp' || !openWithArmy.get()) return;
      box.open();
      actions.tab('battles');
    });
    ctx.bus.on('army.target', ({ opponent, kind }) => {
      if (kind !== 'pvp' || !box.isOpen || !openWithArmy.get()) return;
      // all toggles back on, so the opponent shows whatever its marks and battles
      setFilter({ ...NO_FILTER, name: nameOf(opponent) });
    });
    // the arena overview brings the log, defenses included; the box opens on it
    ctx.bus.on('arena.opened', () => {
      if (!openWithArena.get()) return;
      box.open();
      actions.tab('arena');
    });
    ctx.bus.on('battle.recorded', onRecorded);
    ctx.bus.on('plunder.recorded', onRecorded);
    ctx.bus.on('incoming.recorded', onRecorded);
    ctx.bus.on('arena.logRecorded', onRecorded);
    ctx.bus.on('arena.battleRecorded', onRecorded);
    // the history covers all points and lines, whoever the filters match
    ctx.bus.on('arena.pointsRecorded', loadHistory);
    ctx.bus.on('arena.logRecorded', loadHistory);
    // the block of the opponents on offer, whatever the filters say: a new draw and the lines about them load it again
    ctx.bus.on('arena.opponents', () => {
      if (tab === 'arena') show();
    });
    const offered = (opponents: PlayerId[]) => ctx.arena.opponents.current().some((o) => opponents.includes(o.player));
    ctx.bus.on('arena.logRecorded', ({ opponents }) => {
      if (tab === 'arena' && offered(opponents)) show();
    });
    // a changed name or PvP mark can change who the filter matches
    // the name field and the mark toggles turn into opponents by the player store
    ctx.bus.on('player.updated', () => (filtersPlayers(filter, tab) ? show() : rebuild()));
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
        // opening the box on the arena tab starts on the attacks as well
        if (!box.isOpen) arenaKind = 'attack';
        box.toggle();
        show();
      },
    });
  },
};
