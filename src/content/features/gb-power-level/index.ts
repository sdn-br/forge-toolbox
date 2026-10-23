import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import type { Construction, OwnShareState } from '../../stores/great-building-model';
import { COPY_PLAYER, copyBuildingKey, readCopyOptions } from '../../ui/own-share-copy';
import { powerLevelView } from './view';
import { powerLevelViewModel } from './view-model';

/** the setting of the Eigenanteil box this box reads too */
const ONE_FP = 'gbOwn.oneFpForNoReward';
/** how long a copy button says it copied */
const COPIED_MS = 1500;

/** `copy` writes to the clipboard; tests pass their own. */
export function createGbPowerLevelFeature(
  copy: (text: string) => Promise<void> = (text) => navigator.clipboard.writeText(text),
): Feature {
  return {
    id: 'gbPowerLevel',
    setup(ctx) {
      /** what the Eigenanteil box holds for the building it shows: factors, Ext and the switches */
      let own: OwnShareState | undefined;
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
          own,
          oneFpForNoReward: ctx.settings.get(ONE_FP),
          copy: readCopyOptions(ctx.settings),
          copyPlayer: ctx.settings.text(COPY_PLAYER) || ctx.session.current?.name,
          copyBuilding: def ? ctx.ui.pref(copyBuildingKey(def)) : undefined,
          from,
          to,
        });
      };
      const box = ctx.createBox({
        id: 'gbPowerLevel',
        title: () => t('gbPower.title'),
        width: 560,
        render: () =>
          powerLevelView(
            vm(),
            {
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
      ctx.bus.on('gbOwn.state', (state) => {
        own = state;
        box.update();
      });
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
