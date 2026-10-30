import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import type { Construction } from '../../model/great-building';
import {
  ARC_BUTTON,
  FACTOR,
  FACTOR_ARC,
  FACTOR_BUTTONS,
  ONE_FP,
  ownArcBonus,
  SECURE,
  TRUST,
  viewFlag,
} from '../../stores/gb-own-state';
import { icons } from '../../ui/icons';
import {
  COPY_MANUAL,
  COPY_MODE,
  COPY_PLAYER,
  COPY_TOGGLE_DEFS,
  COPY_TOGGLES,
  COPY_WARN_PREFIX,
  COPY_WARN_SUFFIX,
  copyBuildingKey,
  readCopyOptions,
} from './copy-text';
import { ownShareCss } from './styles';
import { type OwnShareActions, ownShareView } from './view';
import { ownShareViewModel } from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.gbOwnShare;

export const AUTO_OPEN = toggleDef({
  key: 'gbOwn.autoOpen',
  group: 'gbOwn.title',
  label: 'gbOwn.autoOpenSetting',
  default: true,
});
export const CLOSE_WITHOUT_WINDOW = toggleDef({
  key: 'gbOwn.closeWithoutWindow',
  group: 'gbOwn.title',
  label: 'gbOwn.closeWithoutWindowSetting',
  default: true,
});
/** how long a copy button says it copied */
const COPIED_MS = 1500;

/** `copy` writes to the clipboard; tests pass their own. */
export function createGbOwnShareFeature(
  copy: (text: string) => Promise<void> = (text) => navigator.clipboard.writeText(text),
): Feature {
  return {
    id: 'gbOwnShare',
    setup(ctx) {
      ctx.settings.registerGroup('gbOwn.title', ICON);
      ctx.settings.register(FACTOR);
      ctx.settings.register(FACTOR_BUTTONS);
      ctx.settings.register(ARC_BUTTON);
      ctx.settings.register(FACTOR_ARC);
      ctx.settings.register(ONE_FP);
      const autoOpen = ctx.settings.register(AUTO_OPEN);
      const closeWithoutWindow = ctx.settings.register(CLOSE_WITHOUT_WINDOW);
      ctx.settings.register(COPY_PLAYER);
      for (const [option] of COPY_TOGGLES) ctx.settings.register(COPY_TOGGLE_DEFS[option]);
      ctx.settings.register(COPY_WARN_PREFIX);
      ctx.settings.register(COPY_WARN_SUFFIX);
      ctx.settings.register(COPY_MODE);
      ctx.settings.register(COPY_MANUAL);

      /** the last own construction, and the level it was opened at */
      let shown: Construction | undefined;
      let openedLevel: number | undefined;
      /** the later level the box previews; undefined shows the open level */
      let preview: number | undefined;
      let copied: string | undefined;
      let copiedTimer: ReturnType<typeof setTimeout> | undefined;

      const flag = (key: string, fallback: boolean) => viewFlag(ctx.ui, key, fallback);
      const def = () => shown?.entity?.def;
      /** the factors and Ext both boxes share */
      const state = ctx.gbOwn;
      /** a change to the factors of the building shown; the state announces it and the box follows */
      const onFactors = (change: (d: string) => void) => () => {
        const d = def();
        if (d) change(d);
      };

      const actions: OwnShareActions = {
        setFactor: (value) => onFactors((d) => state.setAll(d, { value, arc: false }))(),
        useArc: () => onFactors((d) => state.setAll(d, { value: 0, arc: true }))(),
        setPlaceFactor: (rank, value) => onFactors((d) => state.setPlace(d, rank, value))(),
        saveFactors: onFactors((d) => state.save(d)),
        resetFactors: onFactors((d) => state.reset(d)),
        adoptFactors: onFactors((d) => state.adopt(d)),
        setExt: (rank, fp) => {
          const d = def();
          if (d && openedLevel !== undefined) state.setExt(d, openedLevel, rank, fp);
        },
        setSecure: (on) => save(SECURE, String(on)),
        setTrust: (on) => save(TRUST, String(on)),
        setCopyBuilding: (name) => {
          const d = def();
          if (d) save(copyBuildingKey(d), name);
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
        openPowerLevel: () => ctx.open('gbPowerLevel'),
        previewLevel: (level) => {
          preview = level;
          update();
        },
      };
      const save = (key: string, value: string) => {
        ctx.ui.savePref(key, value);
        update();
      };

      const arcNow = () => ownArcBonus(ctx.settings, ctx.cities, ctx.greatBuildings);
      const update = () => box.update();

      const vm = () => {
        const d = def();
        return ownShareViewModel({
          construction: shown,
          openedLevel,
          greatBuildingName: (id) => ctx.catalog.greatBuildingName(id),
          factors: state.state(d ?? ''),
          factorButtons: ctx.settings.of(FACTOR_BUTTONS).get(),
          arcBonus: arcNow(),
          secureExisting: flag(SECURE, true),
          trust: flag(TRUST, false),
          oneFpForNoReward: ctx.settings.of(ONE_FP).get(),
          exts: state.ext(d ?? '', openedLevel),
          copy: readCopyOptions(ctx.settings),
          copyPlayer: ctx.settings.of(COPY_PLAYER).get() || ctx.session.current?.name,
          copyBuilding: d ? ctx.ui.pref(copyBuildingKey(d)) : undefined,
          previewLevel: preview,
          greatBuilding: (id) => ctx.catalog.get(id)?.greatBuilding,
        });
      };
      const box = ctx.createBox({
        id: 'gbOwnShare',
        css: ownShareCss,
        settings: 'gbOwn.title',
        title: () => t('gbOwn.title'),
        width: 500,
        render: () => ownShareView(vm(), actions, copied),
      });

      const follow = () => {
        const current = ctx.greatBuildings.current();
        if (!current?.own) return false;
        shown = current;
        return true;
      };

      ctx.bus.on('greatBuilding.opened', ({ own }) => {
        if (!own || !follow()) return;
        openedLevel = shown?.entity?.level;
        preview = undefined;
        if (autoOpen.get()) box.open();
        else update();
      });
      ctx.bus.on('greatBuilding.changed', ({ reason }) => {
        if (!follow()) return;
        // An own contribution brings the rankings of the level the building is on now, also when it levelled it
        // (recorded 2026-10-23): the box goes on with that level as if it were opened there, without the Ext of the
        // old one. Other news of a new level come without rankings, and the box asks to reopen.
        const level = shown?.entity?.level;
        if (reason === 'contributed' && level !== openedLevel) {
          openedLevel = level;
          preview = undefined;
        }
        update();
      });
      /** the game shows an own great building, as the page module last reported */
      let ownWindow = false;
      // the own great building closed in the game; the box goes with it, also when the player opened it by hand then,
      // but not for a change that had no own great building before. The Powerleveln box stays.
      ctx.bus.on('gbWindow.changed', ({ state }) => {
        const closed = ownWindow && state !== 'own';
        ownWindow = state === 'own';
        if (closed && box.isOpen && closeWithoutWindow.get()) box.close();
      });
      ctx.bus.on('catalog.updated', () => update());
      ctx.bus.on('city.ownChanged', () => update());
      // the other box changed the factors or Ext of the building
      ctx.bus.on('gbOwn.factorsChanged', () => update());
      ctx.bus.on('gbOwn.extChanged', () => update());
      ctx.settings.onChange((key) => {
        // the factor of the settings sets all five places alike again
        if (key === FACTOR.key || key === FACTOR_ARC.key) state.dropStandard();
        update();
      });
      ctx.menu.add({ id: 'gbOwnShare', icon: ICON, label: () => t('gbOwn.menu'), action: () => box.toggle() });
    },
  };
}

export const gbOwnShareFeature = createGbOwnShareFeature();
