import { foestatsDay, foestatsPlayerUrl } from '../../../shared/foestats';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { arcBonus } from '../../domain/gb-calculator';
import { FOESTATS_SETTING } from '../../stores/foestats';
import type { Construction } from '../../stores/great-building-model';
import { icons } from '../../ui/icons';
import { playTone } from '../../ui/tone';
import { type GbCalculatorActions, gbCalculatorView } from './view';
import { type GbCalculatorVm, gbCalculatorViewModel } from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.gbCalculator;

const FACTOR = 'gbCalc.factor';
const FACTOR_ARC = 'gbCalc.factorArc';
const FACTOR_BUTTONS = 'gbCalc.factorButtons';
const ARC_BUTTON = 'gbCalc.arcButton';
const SOUND = 'gbCalc.sound';
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

      /** the last foreign construction; an own one opened later leaves it in the box */
      let shown: Construction | undefined;
      let vm: GbCalculatorVm = { kind: 'none' };
      /** what the last tone was for, so a redraw with the same places stays quiet */
      let toned: string | undefined;
      /** the later level the box previews; undefined shows the construction */
      let preview: number | undefined;

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

      const box = ctx.createBox({
        id: 'gbCalculator',
        settings: 'gbCalc.title',
        title: () => t('gbCalc.title'),
        width: 520,
        render: () => gbCalculatorView(vm, actions),
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
        box.update();
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

      ctx.bus.on('greatBuilding.opened', ({ own }) => {
        if (own || !follow()) return;
        toned = undefined;
        preview = undefined;
        refresh();
        box.open();
        maybeTone(false);
      });
      ctx.bus.on('greatBuilding.changed', ({ reason }) => {
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
        if (player === shown?.owner) refresh();
      });
      ctx.settings.onChange(refresh);
      ctx.menu.add({ id: 'gbCalculator', icon: ICON, label: () => t('gbCalc.menu'), action: () => box.toggle() });
    },
  };
}

export const gbCalculatorFeature = createGbCalculatorFeature();
