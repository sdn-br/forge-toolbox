import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { ONE_FP, ownArcBonus, SECURE, TRUST, viewFlag } from '../../stores/gb-own-state';
import type { Construction } from '../../stores/great-building-model';
import { COPY_PLAYER, copyBuildingKey, readCopyOptions } from '../gb-own-share/copy-text';
import { powerLevelCss } from './styles';
import { powerLevelView } from './view';
import { powerLevelViewModel } from './view-model';

/** the settings of the Eigenanteil box this box reads too */
const FACTOR_BUTTONS = 'gbOwn.factorButtons';
/** how long a copy button says it copied */
const COPIED_MS = 1500;

/** `copy` writes to the clipboard; tests pass their own. */
export function createGbPowerLevelFeature(
  copy: (text: string) => Promise<void> = (text) => navigator.clipboard.writeText(text),
): Feature {
  return {
    id: 'gbPowerLevel',
    setup(ctx) {
      /** the last own construction opened, as in the Eigenanteil box; a foreign one does not replace it */
      let shown: Construction | undefined;
      let from: number | undefined;
      let to: number | undefined;
      let copied: string | undefined;
      let copiedTimer: ReturnType<typeof setTimeout> | undefined;

      const vm = () => {
        const def = shown?.entity?.def;
        return powerLevelViewModel({
          construction: shown,
          greatBuildingName: (id) => ctx.catalog.greatBuildingName(id),
          greatBuilding: (id) => ctx.catalog.get(id)?.greatBuilding,
          factors: ctx.gbOwn.state(def ?? ''),
          factorButtons: ctx.settings.numbers(FACTOR_BUTTONS),
          arcBonus: ownArcBonus(ctx.settings, ctx.cities, ctx.greatBuildings),
          secureExisting: viewFlag(ctx.ui, SECURE, true),
          trust: viewFlag(ctx.ui, TRUST, false),
          exts: ctx.gbOwn.ext(def ?? '', shown?.entity?.level),
          oneFpForNoReward: ctx.settings.get(ONE_FP),
          copy: readCopyOptions(ctx.settings),
          copyPlayer: ctx.settings.text(COPY_PLAYER) || ctx.session.current?.name,
          copyBuilding: def ? ctx.ui.pref(copyBuildingKey(def)) : undefined,
          from,
          to,
        });
      };
      /** a change to the factors of the building shown; the state announces it and the box follows */
      const onFactors = (change: (def: string) => void) => {
        const def = shown?.entity?.def;
        if (def) change(def);
      };
      const box = ctx.createBox({
        id: 'gbPowerLevel',
        css: powerLevelCss,
        title: () => t('gbPower.title'),
        width: 560,
        render: () =>
          powerLevelView(
            vm(),
            {
              setFactor: (value) => onFactors((d) => ctx.gbOwn.setAll(d, { value, arc: false })),
              useArc: () => onFactors((d) => ctx.gbOwn.setAll(d, { value: 0, arc: true })),
              setPlaceFactor: (rank, value) => onFactors((d) => ctx.gbOwn.setPlace(d, rank, value)),
              saveFactors: () => onFactors((d) => ctx.gbOwn.save(d)),
              resetFactors: () => onFactors((d) => ctx.gbOwn.reset(d)),
              adoptFactors: () => onFactors((d) => ctx.gbOwn.adopt(d)),
              setFrom: (level) => {
                from = level;
                box.update();
              },
              setTo: (level) => {
                to = level;
                box.update();
              },
              copy: (text, id) => {
                copy(text)
                  .then(() => {
                    copied = id;
                    box.update();
                    clearTimeout(copiedTimer);
                    copiedTimer = setTimeout(() => {
                      copied = undefined;
                      box.update();
                    }, COPIED_MS);
                  })
                  .catch((error) => logError('copying failed', error));
              },
            },
            copied,
          ),
      });

      const follow = () => {
        const current = ctx.greatBuildings.current();
        if (!current?.own) return false;
        shown = current;
        return true;
      };

      ctx.bus.on('gbPowerLevel.open', () => box.open());
      // either box changed the factors or Ext of a building
      ctx.bus.on('gbOwn.factorsChanged', () => box.update());
      ctx.bus.on('gbOwn.extChanged', () => box.update());
      // another own building starts with the default levels again
      ctx.bus.on('greatBuilding.opened', () => {
        if (!follow()) return;
        from = undefined;
        to = undefined;
        box.update();
      });
      ctx.bus.on('greatBuilding.changed', () => {
        if (follow()) box.update();
      });
      ctx.bus.on('catalog.updated', () => box.update());
      ctx.settings.onChange(() => box.update());
    },
  };
}

export const gbPowerLevelFeature = createGbPowerLevelFeature();
