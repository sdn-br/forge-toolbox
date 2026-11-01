import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { BattleWithPlunder } from '../../../shared/model';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { rowFit } from '../../ui/fit-rows';
import { icons } from '../../ui/icons';
import { PlayerNoteCard } from '../../ui/note-card';
import { rowWindow } from '../../ui/windowed-rows';
import { playerLookups, playerRowActions } from '../shared/player-lookups';
import { createBattlesSection } from './battles/section';
import { prunedBy, reselect } from './battles/selection';
import { battlePanelVm } from './battles/view-model';
import { createIncomingSection } from './incoming/section';
import { KEEP_SETTING, pruneBefore } from './retention';
import {
  NO_FILTER,
  opponentsFor,
  type PvpActions,
  type PvpFilter,
  type PvpTab,
  pickedPlayer,
  type ViewInput,
} from './rows';
import { BATTLES_MIN_WIDTH, pvpCss } from './styles';
import type { PvpSection, PvpVm } from './tabs';
import { pvpView } from './view';

/** the menu entry and the settings group show it */
const ICON = icons.pvp;

export const OPEN_WITH_ARMY = toggleDef({
  key: 'pvp.openWithArmy',
  group: 'pvp.title',
  label: 'pvp.openWithArmy',
  default: true,
});

/** the battles table, the body padding 16, the two scroll buttons with their gap 26 and 20 for the cell padding */
const WIDTH = BATTLES_MIN_WIDTH + 16 + 26 + 20;
/** the height the box needs for what always shows, so the table area keeps room for rows: border 4 + header 29 + body
 * padding 12 + tabs 32 + filter row 46 + totals line 31 + head row 22 + two rows 2 x 23 + the line of hidden rows 21 =
 * 243, rounded up. Worked out from the styles like the investments, not measured.
 * debt: kept by hand. ceiling: a wrapping filter row or the note card take more; the area then holds fewer rows */
const MIN_HEIGHT = 250;
/** a window loads this many times the rows that fit, from one window above it, so scrolling reads only now and then */
const SLICE_WINDOWS = 3;

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
    /** how many rows fit into the table area; a change redraws */
    const fit = rowFit(() => box.update());

    // loads the totals of the active tab and a slice of its rows around the window
    const refresh = async () => {
      if (!box.isOpen) return;
      const current = ++query;
      const opponents = opponentsFor(filter, players());
      opponentsShown = opponents;
      const visible = fit.rows();
      requested = { offset: Math.max(0, top - visible), limit: SLICE_WINDOWS * visible };
      const { build, battles } = await sections[tab].load(
        { opponents, withPlunder: filter.withPlunder },
        requested.offset,
        requested.limit,
      );
      // a newer query started meanwhile and will render
      if (current !== query) return;
      const input = {
        filter,
        lookups,
        building: (id: BuildingDefId) => ctx.catalog.get(id)?.name,
        resourceName: (id: string) => ctx.catalog.resourceName(id),
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
    const show = () => {
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
        top += rows;
        box.update();
      },
      measure: fit.measure,
    };

    const render = () => {
      const picked = filter.name.trim() ? pickedPlayer(filter.name, players()) : undefined;
      const note = picked === undefined ? undefined : card.render(picked, ctx.players.get(picked)?.name);
      const side = selected && lastInput && { open: panelOpen, selected: battlePanelVm(selected, lastInput) };
      if (!vm) return pvpView(tab, filter, undefined, actions, note, side);
      const visible = fit.rows();
      const rows = rowWindow(top, vm.total, visible);
      top = rows.top;
      // the window left the slice asked for: load the slice around it; a list shorter than asked ends there
      const end = requested.offset + requested.limit;
      if (vm.total > 0 && (top < requested.offset || (top + visible > end && end < vm.total))) show();
      return pvpView(tab, filter, { vm, window: rows }, actions, note, side);
    };

    const box = ctx.createBox({
      id: 'pvp',
      css: pvpCss,
      settings: 'pvp.title',
      title: () => t('pvp.title'),
      width: WIDTH,
      // the lists grow with every battle; the height is the viewer's. It starts tall, since the rows that fit are
      // counted in the height the box gives the table
      resizable: true,
      fill: true,
      defaultSize: (win) => ({ width: WIDTH, height: Math.min(win.height * 0.7, 600) }),
      minHeight: MIN_HEIGHT,
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
