import { html } from 'lit-html';
import { foestatsDay, foestatsPlayerUrl } from '../../../shared/foestats';
import type { PlayerId } from '../../../shared/ids';
import type { KnownGreatBuilding } from '../../../shared/model';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { arcBonus } from '../../domain/gb-calculator';
import { type SnipeList, snipeList } from '../../domain/gb-snipe';
import { FOESTATS_SETTING } from '../../stores/foestats';
import type { Construction } from '../../stores/great-building-model';
import { CALCULATOR_FACTOR, calculatorFactor } from '../../ui/factor-bar';
import { icons } from '../../ui/icons';
import { playTone } from '../../ui/tone';
import { type SnipeActions, snipeView } from './snipe-view';
import { clampScroll, DEFAULT_SORT, nextSort, type SnipeSort, type SnipeVm, snipeViewModel } from './snipe-view-model';
import { type GbCalculatorActions, gbCalculatorView } from './view';
import { type GbCalculatorVm, gbCalculatorViewModel } from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.gbCalculator;

const FACTOR = CALCULATOR_FACTOR.value;
const FACTOR_ARC = CALCULATOR_FACTOR.arc;
const FACTOR_BUTTONS = 'gbCalc.factorButtons';
const ARC_BUTTON = CALCULATOR_FACTOR.arcButton;
const SOUND = 'gbCalc.sound';
const RETENTION = 'snipe.retentionDays';
/** a list this soon after the owner's building was opened or paid into is the game's own question, not the player's */
const ASKED_BY_GAME = 3000;
const SNIPE_OPEN = 'snipe.open';
const SNIPE_SOUND = 'snipe.sound';
const FP = 'strategy_points';

/** `tone` plays the sound for a profitable place; tests pass their own. */
export function createGbCalculatorFeature(tone: () => void = playTone): Feature {
  return {
    id: 'gbCalculator',
    setup(ctx) {
      ctx.settings.registerGroup('gbCalc.title', ICON);
      ctx.settings.register({
        key: FACTOR,
        group: 'gbCalc.title',
        label: 'gbCalc.factorSetting',
        default: 90,
        min: -100,
        max: 200,
        step: 0.1,
        asFactor: true,
      });
      ctx.settings.register({
        key: FACTOR_ARC,
        group: 'gbCalc.title',
        label: 'gbCalc.factorArcSetting',
        default: false,
      });
      ctx.settings.register({
        key: FACTOR_BUTTONS,
        group: 'gbCalc.title',
        label: 'gbCalc.factorButtonsSetting',
        hint: 'gbCalc.factorButtonsHint',
        default: [80, 90, 100],
        min: -100,
        max: 200,
        step: 0.1,
        asFactor: true,
      });
      ctx.settings.register({
        key: ARC_BUTTON,
        group: 'gbCalc.title',
        label: 'gbCalc.arcButtonSetting',
        default: true,
      });
      ctx.settings.register({ key: SOUND, group: 'gbCalc.title', label: 'gbCalc.soundSetting', default: true });
      ctx.settings.register({
        key: RETENTION,
        group: 'gbCalc.title',
        section: 'snipe.section',
        label: 'snipe.retentionSetting',
        default: 30,
        min: 1,
        max: 365,
      });
      ctx.settings.register({
        key: SNIPE_OPEN,
        group: 'gbCalc.title',
        section: 'snipe.section',
        label: 'snipe.openSetting',
        default: true,
      });
      ctx.settings.register({
        key: SNIPE_SOUND,
        group: 'gbCalc.title',
        section: 'snipe.section',
        label: 'snipe.soundSetting',
        default: true,
      });
      // buildings of other players not seen for that long go; those with an own contribution stay
      ctx.greatBuildings
        .prune(ctx.settings.number(RETENTION))
        .catch((error) => logError('pruning great buildings failed', error));

      /** the last foreign construction; an own one opened later leaves it in the box */
      let shown: Construction | undefined;
      let vm: GbCalculatorVm = { kind: 'none' };
      /** what the last tone was for, so a redraw with the same places stays quiet */
      let toned: string | undefined;
      /** the later level the box previews; undefined shows the construction */
      let preview: number | undefined;

      /** the section "Mögliche Einzahlungen" is unfolded; a new list unfolds it, a building of another player than the
       * list's owner folds it, else the player */
      let expanded = false;
      /** the last list of another player, with the stored state of its buildings */
      let list: { owner: PlayerId; ownerName?: string; at: number; entityIds: Set<number> } | undefined;
      let listed: KnownGreatBuilding[] = [];
      let snipe: SnipeList | undefined;
      let snipeVm: SnipeVm = { kind: 'none' };
      let sort: SnipeSort = DEFAULT_SORT;
      /** index of the first table row in view; a new list starts at the top, redraws of the same list keep it */
      let scroll = 0;
      /** what the last list tone was for: the same hits stay quiet */
      let snipeToned: string | undefined;
      let loads = 0;

      const save = (key: string, value: boolean | number) =>
        ctx.settings.set(key, value).catch((error) => logError('saving settings failed', error));
      const actions: GbCalculatorActions = {
        setFactor: (value) => {
          save(FACTOR, value);
          save(FACTOR_ARC, false);
        },
        useArc: () => save(FACTOR_ARC, true),
        previewLevel: (level) => {
          preview = level;
          refresh();
        },
      };

      const snipeActions: SnipeActions = {
        sort: (column) => {
          sort = nextSort(sort, column);
          refresh();
        },
        scroll: (rows) => {
          const rowCount = snipeVm.kind === 'list' ? snipeVm.rows.length : 0;
          scroll = clampScroll(scroll + rows, rowCount);
          refresh();
        },
        toggle: () => {
          expanded = !expanded;
          box.update();
        },
      };

      const box = ctx.createBox({
        id: 'gbCalculator',
        settings: 'gbCalc.title',
        title: () => t('gbCalc.title'),
        width: 520,
        // 6 table rows, the section and the calculator fit without the body scrolling on a normal window
        maxHeight: 0.92,
        render: () => html`${snipeView(snipeVm, snipeActions, expanded)}${gbCalculatorView(vm, actions)}`,
      });

      const refresh = () => {
        vm = gbCalculatorViewModel({
          construction: shown,
          greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
          playerName: (id) => ctx.players.get(id)?.name,
          playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
          fpBar: ctx.resources.known ? ctx.resources.amount(FP) : undefined,
          fpPackages: ctx.inventory.knowsPackages ? ctx.inventory.forgePointPackages() : undefined,
          arcBonus: arcBonus(ctx.cities.own(), ctx.greatBuildings.limitedBonuses()),
          factor: { value: ctx.settings.number(FACTOR), arc: ctx.settings.get(FACTOR_ARC) },
          factorButtons: ctx.settings.numbers(FACTOR_BUTTONS),
          arcButton: ctx.settings.get(ARC_BUTTON),
          foestats: shown && ctx.settings.get(FOESTATS_SETTING.key) ? ctx.foestats.get(shown.owner) : undefined,
          today: foestatsDay(Date.now()),
          previewLevel: preview,
          greatBuilding: (def) => ctx.catalog.get(def)?.greatBuilding,
        });
        const arc = arcBonus(ctx.cities.own(), ctx.greatBuildings.limitedBonuses());
        snipe =
          list &&
          snipeList({
            buildings: listed,
            greatBuilding: (def) => ctx.catalog.get(def)?.greatBuilding,
            arcBonus: arc,
            factor: calculatorFactor(ctx.settings, arc),
          });
        snipeVm = snipeViewModel({
          list,
          result: snipe,
          greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
          playerName: (id) => ctx.players.get(id)?.name,
          playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
          foestats: list && ctx.settings.get(FOESTATS_SETTING.key) ? ctx.foestats.get(list.owner) : undefined,
          today: foestatsDay(Date.now()),
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
        if (!(await loadList()) || !snipe || snipe.hits.length === 0) return;
        const key = `${list?.owner}|${snipe.hits.map((h) => `${h.entityId}:${h.tier}:${h.place.rank}:${h.place.cost}`).join(',')}`;
        if (ctx.settings.get(SNIPE_OPEN)) box.open();
        if (ctx.settings.get(SNIPE_SOUND) && key !== snipeToned) tone();
        snipeToned = key;
      };

      /** a tone once per new state of the places that has a profitable one, and once for a level up */
      const maybeTone = (leveled: boolean) => {
        if (vm.kind !== 'current' || !ctx.settings.get(SOUND)) return;
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
        // a building of the list's owner keeps the list open, it is what the player is going through
        if (list?.owner !== owner) expanded = false;
        toned = undefined;
        preview = undefined;
        refresh();
        box.open();
        maybeTone(false);
      });
      ctx.bus.on('greatBuilding.changed', ({ owner, entityId, reason }) => {
        listChanged(owner, entityId);
        if (!follow()) return;
        refresh();
        maybeTone(reason === 'leveled');
      });
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
