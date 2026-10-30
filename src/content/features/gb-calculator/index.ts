import { html } from 'lit-html';
import { foestatsDay, foestatsPlayerUrl } from '../../../shared/foestats';
import type { GbWindowState } from '../../../shared/gb-window-protocol';
import type { PlayerId } from '../../../shared/ids';
import type { KnownGreatBuilding } from '../../../shared/model';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { listDef, numberDef, type Setting, toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { type SnipeList, snipeList } from '../../domain/gb-snipe';
import type { Construction } from '../../model/great-building';
import { FOESTATS_SETTING } from '../../stores/foestats';
import { icons } from '../../ui/icons';
import { nextSort } from '../../ui/sortable';
import { type SnipeActions, snipeView } from './snipe-view';
import {
  clampScroll,
  DEFAULT_SORT,
  SNIPE_DESC_FIRST,
  type SnipeSort,
  type SnipeVm,
  snipeViewModel,
} from './snipe-view-model';
import { gbCalculatorCss } from './styles';
import { playTone } from './tone';
import { type GbCalculatorActions, gbCalculatorView } from './view';
import { type GbCalculatorVm, gbCalculatorViewModel } from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.gbCalculator;

export const FACTOR = numberDef({
  key: 'gbCalc.factor',
  group: 'gbCalc.title',
  label: 'gbCalc.factorSetting',
  default: 90,
  min: -100,
  max: 200,
  step: 0.1,
  asFactor: true,
});
export const FACTOR_ARC = toggleDef({
  key: 'gbCalc.factorArc',
  group: 'gbCalc.title',
  label: 'gbCalc.factorArcSetting',
  default: false,
});
export const FACTOR_BUTTONS = listDef({
  key: 'gbCalc.factorButtons',
  group: 'gbCalc.title',
  label: 'gbCalc.factorButtonsSetting',
  hint: 'gbCalc.factorButtonsHint',
  default: [80, 90, 100],
  min: -100,
  max: 200,
  step: 0.1,
  asFactor: true,
});
export const ARC_BUTTON = toggleDef({
  key: 'gbCalc.arcButton',
  group: 'gbCalc.title',
  label: 'gbCalc.arcButtonSetting',
  default: true,
});
export const SOUND = toggleDef({
  key: 'gbCalc.sound',
  group: 'gbCalc.title',
  label: 'gbCalc.soundSetting',
  default: true,
});
export const CLOSE_WITHOUT_WINDOW = toggleDef({
  key: 'gbCalc.closeWithoutWindow',
  group: 'gbCalc.title',
  label: 'gbCalc.closeWithoutWindowSetting',
  default: true,
});
export const RETENTION = numberDef({
  key: 'snipe.retentionDays',
  group: 'gbCalc.title',
  section: 'snipe.section',
  label: 'snipe.retentionSetting',
  default: 30,
  min: 1,
  max: 365,
});
/** a list this soon after the owner's building was opened or paid into is the game's own question, not the player's */
const ASKED_BY_GAME = 3000;
export const SNIPE_OPEN = toggleDef({
  key: 'snipe.open',
  group: 'gbCalc.title',
  section: 'snipe.section',
  label: 'snipe.openSetting',
  default: true,
});
export const SNIPE_SOUND = toggleDef({
  key: 'snipe.sound',
  group: 'gbCalc.title',
  section: 'snipe.section',
  label: 'snipe.soundSetting',
  default: true,
});
/** the snipe section shows the rows of ignored buildings and owners; a view choice, saved as 'true' or 'false' */
const SNIPE_SHOW_IGNORED = 'snipe.showIgnored';
const FP = 'strategy_points';

/** `tone` plays the sound for a profitable place; tests pass their own. */
export function createGbCalculatorFeature(tone: () => void = playTone): Feature {
  return {
    id: 'gbCalculator',
    setup(ctx) {
      ctx.settings.registerGroup('gbCalc.title', ICON);
      const factor = ctx.settings.register(FACTOR);
      const factorArc = ctx.settings.register(FACTOR_ARC);
      const factorButtons = ctx.settings.register(FACTOR_BUTTONS);
      const arcButton = ctx.settings.register(ARC_BUTTON);
      const sound = ctx.settings.register(SOUND);
      const closeWithoutWindow = ctx.settings.register(CLOSE_WITHOUT_WINDOW);
      const retention = ctx.settings.register(RETENTION);
      const snipeOpen = ctx.settings.register(SNIPE_OPEN);
      const snipeSound = ctx.settings.register(SNIPE_SOUND);
      // buildings of other players not seen for that long go; those with an own contribution stay
      ctx.greatBuildings.prune(retention.get()).catch((error) => logError('pruning great buildings failed', error));

      /** the last foreign construction; an own one opened later leaves it in the box */
      let shown: Construction | undefined;
      let vm: GbCalculatorVm = { kind: 'none' };
      /** what the last tone was for, so a redraw with the same places stays quiet */
      let toned: string | undefined;
      /** the later level the box previews; undefined shows the construction */
      let preview: number | undefined;

      /** the section "Mögliche Einzahlungen" is unfolded; a new list unfolds it, a building of another player than the
       * list's owner folds it, the window the game shows (gbWindow.changed) too, else the player */
      let expanded = false;
      /** the last list of another player, with the stored state of its buildings */
      let list: { owner: PlayerId; ownerName?: string; at: number; entityIds: Set<number> } | undefined;
      let listed: KnownGreatBuilding[] = [];
      let snipe: SnipeList | undefined;
      let snipeVm: SnipeVm = { kind: 'none' };
      let sort: SnipeSort = DEFAULT_SORT;
      let showIgnored = ctx.ui.pref(SNIPE_SHOW_IGNORED) === 'true';
      /** index of the first table row in view; a new list starts at the top, redraws of the same list keep it */
      let scroll = 0;
      /** what the last list tone was for: the same hits stay quiet */
      let snipeToned: string | undefined;
      /** the calculator is folded to one line; a new list folds it, opening a building unfolds it, the window the game
       * shows too, else the player */
      let calcFolded = false;
      /** the GB window the game shows by the last gbWindow.changed; stays 'none' when the engine is not found */
      let shownWindow: GbWindowState = 'none';
      /** one part stays open: folding the last open part unfolds the other; without a list the calculator is alone */
      const hasSection = () => snipeVm.kind !== 'none';
      /** the calculator shows a building, so the snipe section can fold */
      const hasBuilding = () => vm.kind !== 'none' && vm.kind !== 'noEntity';
      const calcFold = {
        get folded() {
          return calcFolded;
        },
        get foldable() {
          return hasSection();
        },
        toggle: () => {
          calcFolded = !calcFolded;
          if (calcFolded && !expanded) expanded = true;
          box.update();
        },
      };
      let loads = 0;

      const save = <T>(setting: Setting<T>, value: T) =>
        setting.set(value).catch((error) => logError('saving settings failed', error));
      /** whether the player store knows the player and has them marked; undefined for an unknown one, who takes no star */
      const playerMarked = (id: PlayerId) =>
        ctx.players.get(id)?.marked === true || (ctx.players.get(id) ? false : undefined);
      /** whether the player ignores the owner; undefined for a player the store does not know */
      const ownerIgnored = (id: PlayerId) => {
        const player = ctx.players.get(id);
        return player && player.ignored === true;
      };
      const isIgnored = (owner: PlayerId, entityId: number) => ctx.greatBuildings.isIgnored(owner, entityId);
      /** the building, or its owner, is ignored */
      const ignores = (owner: PlayerId, entityId: number) => isIgnored(owner, entityId) || ownerIgnored(owner) === true;
      const ignoreBuilding = (owner: PlayerId, entityId: number, ignored: boolean) =>
        ctx.greatBuildings
          .ignore(owner, entityId, ignored)
          .catch((error) => logError('ignoring a great building failed', error));
      const markBuilding = (owner: PlayerId, entityId: number, marked: boolean) =>
        ctx.greatBuildings
          .mark(owner, entityId, marked)
          .catch((error) => logError('marking a great building failed', error));
      const actions: GbCalculatorActions = {
        setFactor: (value) => {
          save(factor, value);
          save(factorArc, false);
        },
        useArc: () => save(factorArc, true),
        previewLevel: (level) => {
          preview = level;
          refresh();
        },
        toggleMark: (marked) => {
          if (shown) markBuilding(shown.owner, shown.entityId, marked);
        },
        toggleOwnerMark: (marked) => {
          if (shown) ctx.players.setMarked(shown.owner, marked);
        },
        toggleIgnore: (ignored) => {
          if (shown) ignoreBuilding(shown.owner, shown.entityId, ignored);
        },
        toggleOwnerIgnore: (ignored) => {
          if (shown) ctx.players.setIgnored(shown.owner, ignored);
        },
      };

      const snipeActions: SnipeActions = {
        sort: (column, append) => {
          sort = nextSort(sort, column, SNIPE_DESC_FIRST, append);
          refresh();
        },
        scroll: (rows) => {
          const rowCount = snipeVm.kind === 'list' ? snipeVm.rows.length : 0;
          scroll = clampScroll(scroll + rows, rowCount);
          refresh();
        },
        toggle: () => {
          expanded = !expanded;
          if (!expanded && calcFolded) calcFolded = false;
          box.update();
        },
        mark: markBuilding,
        markPlayer: (player, marked) => ctx.players.setMarked(player, marked),
        ignore: ignoreBuilding,
        ignorePlayer: (player, ignored) => ctx.players.setIgnored(player, ignored),
        showIgnored: (show) => {
          showIgnored = show;
          ctx.ui.savePref(SNIPE_SHOW_IGNORED, String(show));
          refresh();
        },
      };

      const box = ctx.createBox({
        id: 'gbCalculator',
        css: gbCalculatorCss,
        settings: 'gbCalc.title',
        title: () => t('gbCalc.title'),
        // the snipe table: fixed columns of 518 px and the building name with its 16 px eye; until 2026-10-25 a CSS cap held fixed boxes at 520 px
        width: 618,
        // 6 table rows, the section and the calculator fit without the body scrolling on a normal window
        maxHeight: 0.92,
        render: () =>
          html`${snipeView(snipeVm, snipeActions, expanded, hasBuilding())}${gbCalculatorView(vm, actions, calcFold)}`,
      });

      const refresh = () => {
        vm = gbCalculatorViewModel({
          construction: shown,
          greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
          playerName: (id) => ctx.players.get(id)?.name,
          playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
          isMarked: (owner, entityId) => ctx.greatBuildings.isMarked(owner, entityId),
          playerMarked,
          isIgnored,
          ownerIgnored,
          fpBar: ctx.resources.known ? ctx.resources.amount(FP) : undefined,
          fpPackages: ctx.inventory.knowsPackages ? ctx.inventory.forgePointPackages() : undefined,
          arcBonus: ctx.playerBonuses.arcBonus(),
          factor: { value: factor.get(), arc: factorArc.get() },
          factorButtons: factorButtons.get(),
          arcButton: arcButton.get(),
          foestats: shown && ctx.settings.of(FOESTATS_SETTING).get() ? ctx.foestats.get(shown.owner) : undefined,
          today: foestatsDay(Date.now()),
          previewLevel: preview,
          greatBuilding: (def) => ctx.catalog.get(def)?.greatBuilding,
        });
        const arc = ctx.playerBonuses.arcBonus();
        snipe =
          list &&
          snipeList({
            buildings: listed,
            greatBuilding: (def) => ctx.catalog.get(def)?.greatBuilding,
            arcBonus: arc,
          });
        snipeVm = snipeViewModel({
          list,
          result: snipe,
          greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
          playerName: (id) => ctx.players.get(id)?.name,
          playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
          isMarked: (owner, entityId) => ctx.greatBuildings.isMarked(owner, entityId),
          playerMarked,
          isIgnored,
          ownerIgnored,
          showIgnored,
          foestats: list && ctx.settings.of(FOESTATS_SETTING).get() ? ctx.foestats.get(list.owner) : undefined,
          today: foestatsDay(Date.now()),
          now: Date.now(),
          sort,
          scroll,
        });
        box.update();
      };

      /** reads the stored state of the buildings of the list; a stale answer is dropped */
      const loadList = async () => {
        const current = list;
        if (!current) return false;
        const load = ++loads;
        const known = await ctx.greatBuildings.known(current.owner);
        if (load !== loads || list !== current) return false;
        listed = known.filter((b) => current.entityIds.has(b.entityId));
        refresh();
        return true;
      };

      /** a new list: open the box when something pays, once per set of hits a tone */
      const onList = async () => {
        if (!(await loadList()) || !snipe) return;
        // ignored buildings and owners are no reason to open the box or to beep
        const hits = snipe.hits.filter((h) => !ignores(h.owner, h.entityId));
        if (hits.length === 0) return;
        const key = `${list?.owner}|${hits.map((h) => `${h.entityId}:${h.tier}:${h.place.rank}:${h.place.cost}`).join(',')}`;
        if (snipeOpen.get()) box.open();
        if (snipeSound.get() && key !== snipeToned) tone();
        snipeToned = key;
      };

      /** a tone once per new state of the places that has a profitable one, and once for a level up */
      /** the shown building, or its owner, is ignored */
      const shownIgnored = () => shown !== undefined && ignores(shown.owner, shown.entityId);

      const maybeTone = (leveled: boolean) => {
        if (vm.kind !== 'current' || !sound.get() || shownIgnored()) return;
        const profitable = vm.places.filter((p) => p.status === 'profit' && (p.profit ?? 0) > 0);
        const places = profitable.map((p) => `${p.rank}:${p.safe?.cost}`).join(',');
        const key = leveled ? `leveled:${vm.leveled}` : vm.profitable ? `${vm.header.name}:${places}` : undefined;
        if (key === undefined || key === toned) return;
        toned = key;
        tone();
      };

      const follow = () => {
        const current = ctx.greatBuildings.current();
        if (!current || current.own) return false;
        shown = current;
        return true;
      };

      ctx.bus.on('greatBuildings.listed', ({ owner, ownerName, entityIds, at }) => {
        // after a contribution that levels a building the game asks for the owner's list to learn names; the player did
        // not open it, so it leaves the box alone
        const open = ctx.greatBuildings.current();
        if (open?.owner === owner && at - open.seenAt < ASKED_BY_GAME) return;
        list = { owner, ...(ownerName !== undefined && { ownerName }), at, entityIds: new Set(entityIds) };
        listed = [];
        scroll = 0;
        expanded = true;
        calcFolded = true;
        onList().catch((error) => logError('reading the great building list failed', error));
      });
      /** the stored state of a building of the list changed: opened or changed in the game */
      const listChanged = (owner: PlayerId, entityId: number) => {
        if (list?.owner === owner && list.entityIds.has(entityId))
          loadList().catch((error) => logError('reading the great building list failed', error));
      };
      ctx.bus.on('greatBuilding.opened', ({ owner, entityId, own }) => {
        if (!own) listChanged(owner, entityId);
        if (own || !follow()) return;
        // a building of the list's owner keeps the list open, it is what the player is going through, unless the game
        // shows the building's window: it comes before the building, so the window signal could not fold yet
        if (list?.owner !== owner || shownWindow === 'foreign') expanded = false;
        calcFolded = false;
        toned = undefined;
        preview = undefined;
        refresh();
        // an ignored building or player does not open the box; by hand it shows with a warning
        if (shownIgnored()) return;
        box.open();
        maybeTone(false);
      });
      ctx.bus.on('greatBuilding.changed', ({ owner, entityId, reason }) => {
        listChanged(owner, entityId);
        if (!follow()) return;
        refresh();
        maybeTone(reason === 'leveled');
      });
      // the window the game shows wins over the traffic: the list unfolds its section, a foreign building the calculator;
      // without either the box closes. It never opens the box, so ignored buildings and players keep it closed.
      ctx.bus.on('gbWindow.changed', ({ state }) => {
        shownWindow = state;
        if (state === 'list') {
          expanded = true;
          if (hasSection()) calcFolded = true;
        } else if (state === 'foreign') {
          calcFolded = false;
          if (hasBuilding()) expanded = false;
        } else if (box.isOpen && closeWithoutWindow.get()) box.close();
        box.update();
      });
      ctx.bus.on('greatBuilding.marked', refresh);
      ctx.bus.on('greatBuilding.ignored', refresh);
      ctx.bus.on('resources.changed', refresh);
      ctx.bus.on('inventory.changed', refresh);
      ctx.bus.on('city.ownChanged', refresh);
      ctx.bus.on('catalog.updated', refresh);
      ctx.bus.on('player.updated', refresh);
      ctx.bus.on('foestats.updated', ({ player }) => {
        if (player === shown?.owner || player === list?.owner) refresh();
      });
      ctx.settings.onChange(refresh);
      ctx.menu.add({ id: 'gbCalculator', icon: ICON, label: () => t('gbCalc.menu'), action: () => box.toggle() });
    },
  };
}

export const gbCalculatorFeature = createGbCalculatorFeature();
