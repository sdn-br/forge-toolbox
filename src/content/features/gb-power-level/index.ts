import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import type { Construction } from '../../model/great-building';
import {
  FACTOR_BUTTONS,
  FACTOR_BUTTONS_GOLD,
  ONE_FP,
  ownArcBonus,
  SECURE,
  TRUST,
  viewFlag,
} from '../../stores/gb-own-state';
import { COPY_PLAYER, copyBuildingKey, readCopyOptions } from '../gb-own-share/copy-text';
import { powerLevelCss } from './styles';
import { powerLevelView, tableEm } from './view';
import { clampScroll, powerLevelViewModel, VISIBLE_ROWS } from './view-model';

/** how long a copy button says it copied */
const COPIED_MS = 1500;
/** the box is never narrower than this */
const MIN_WIDTH = 560;
/** the font size of the box, for the table width in em */
const FONT_PX = 12;
/** the padding of the box body on both sides plus room for its vertical scrollbar */
const BODY_EXTRA = 16 + 18;
/** the two buttons beside the table and their gap, while the level rows move */
const NAV_EXTRA = 18 + 4;

declare module '../../core/shell' {
  interface OpenableBoxes {
    /** the Eigenanteil box opens this one */
    gbPowerLevel: [];
  }
}

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
      /** index of the first level row in view; a new building or range starts at the top, other redraws keep it */
      let top = 0;
      let copied: string | undefined;
      let copiedTimer: ReturnType<typeof setTimeout> | undefined;

      const vm = () => {
        const def = shown?.entity?.def;
        return powerLevelViewModel({
          construction: shown,
          greatBuildingName: (id) => ctx.catalog.greatBuildingName(id),
          greatBuilding: (id) => ctx.catalog.get(id)?.greatBuilding,
          levelCosts: ctx.gbLevelCosts,
          factors: ctx.gbOwn.state(def ?? ''),
          factorButtons: ctx.settings.of(FACTOR_BUTTONS).get(),
          factorButtonsGold: ctx.settings.of(FACTOR_BUTTONS_GOLD).get(),
          arcBonus: ownArcBonus(ctx.settings, ctx.playerBonuses),
          tiers: ctx.catalog.greatBuildingTiers(),
          secureExisting: viewFlag(ctx.ui, SECURE, true),
          trust: viewFlag(ctx.ui, TRUST, false),
          exts: ctx.gbOwn.ext(def ?? '', shown?.entity?.level),
          oneFpForNoReward: ctx.settings.of(ONE_FP).get(),
          copy: readCopyOptions(ctx.settings),
          copyPlayer: ctx.settings.of(COPY_PLAYER).get() || ctx.session.current?.name,
          copyBuilding: def ? ctx.ui.pref(copyBuildingKey(def)) : undefined,
          from,
          to,
          top,
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
        // follows the table: two more place columns on a gold level, the harvest column, the buttons of moving rows
        width: () => {
          const v = vm();
          if (v.kind !== 'table') return MIN_WIDTH;
          const nav = v.rows.length > VISIBLE_ROWS ? NAV_EXTRA : 0;
          return Math.max(MIN_WIDTH, Math.ceil(tableEm(v.places, v.harvestColumn) * FONT_PX) + BODY_EXTRA + nav);
        },
        render: () =>
          powerLevelView(
            vm(),
            {
              setFactor: (value, tier) => onFactors((d) => ctx.gbOwn.setAll(d, { value, arc: false }, tier)),
              useArc: () => onFactors((d) => ctx.gbOwn.setAll(d, { value: 0, arc: true })),
              setPlaceFactor: (rank, value, tier) => onFactors((d) => ctx.gbOwn.setPlace(d, rank, value, tier)),
              saveFactors: () => onFactors((d) => ctx.gbOwn.save(d)),
              resetFactors: () => onFactors((d) => ctx.gbOwn.reset(d)),
              adoptFactors: () => onFactors((d) => ctx.gbOwn.adopt(d)),
              setFrom: (level) => {
                from = level;
                top = 0;
                box.update();
              },
              setTo: (level) => {
                to = level;
                top = 0;
                box.update();
              },
              scroll: (rows) => {
                const v = vm();
                top = clampScroll(top + rows, v.kind === 'table' ? v.rows.length : 0);
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

      ctx.registerOpen('gbPowerLevel', () => box.open());
      // either box changed the factors or Ext of a building
      ctx.bus.on('gbOwn.factorsChanged', () => box.update());
      ctx.bus.on('gbOwn.extChanged', () => box.update());
      // another own building starts with the default levels again
      ctx.bus.on('greatBuilding.opened', () => {
        if (!follow()) return;
        from = undefined;
        to = undefined;
        top = 0;
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
