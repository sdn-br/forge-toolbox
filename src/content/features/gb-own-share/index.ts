import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import {
  ARC_BUTTON,
  FACTOR,
  FACTOR_ARC,
  ONE_FP,
  ownArcBonus,
  SECURE,
  TRUST,
  viewFlag,
} from '../../stores/gb-own-state';
import type { Construction } from '../../stores/great-building-model';
import { icons } from '../../ui/icons';
import {
  COPY_MANUAL,
  COPY_MODE,
  COPY_MODES,
  COPY_PLAYER,
  COPY_TOGGLES,
  COPY_WARN_PREFIX,
  COPY_WARN_SUFFIX,
  copyBuildingKey,
  copyToggleKey,
  DEFAULT_COPY,
  readCopyOptions,
} from '../../ui/own-share-copy';
import { type OwnShareActions, ownShareView } from './view';
import { ownShareViewModel } from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.gbOwnShare;

const FACTOR_BUTTONS = 'gbOwn.factorButtons';
const AUTO_OPEN = 'gbOwn.autoOpen';
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
      ctx.settings.register({
        key: FACTOR,
        group: 'gbOwn.title',
        label: 'gbOwn.factorSetting',
        default: 90,
        min: -100,
        max: 200,
        step: 0.1,
        asFactor: true,
      });
      ctx.settings.register({
        key: FACTOR_BUTTONS,
        group: 'gbOwn.title',
        label: 'gbCalc.factorButtonsSetting',
        hint: 'gbCalc.factorButtonsHint',
        default: [80, 90, 100],
        min: -100,
        max: 200,
        step: 0.1,
        asFactor: true,
      });
      ctx.settings.register({ key: ARC_BUTTON, group: 'gbOwn.title', label: 'gbCalc.arcButtonSetting', default: true });
      ctx.settings.register({ key: FACTOR_ARC, group: 'gbOwn.title', label: 'gbOwn.factorArcSetting', default: false });
      ctx.settings.register({
        key: ONE_FP,
        group: 'gbOwn.title',
        label: 'gbOwn.oneFpSetting',
        hint: 'gbOwn.oneFpHint',
        default: true,
      });
      ctx.settings.register({ key: AUTO_OPEN, group: 'gbOwn.title', label: 'gbOwn.autoOpenSetting', default: true });

      ctx.settings.register({
        key: COPY_PLAYER,
        group: 'gbOwn.title',
        section: 'gbOwn.copySettings',
        label: 'gbOwn.copyPlayerName',
        hint: 'gbOwn.copyPlayerNameHint',
        default: '',
        text: true,
      });
      for (const [option, label] of COPY_TOGGLES)
        ctx.settings.register({
          key: copyToggleKey(option),
          group: 'gbOwn.title',
          section: 'gbOwn.copySettings',
          label,
          default: DEFAULT_COPY[option],
        });
      ctx.settings.register({
        key: COPY_WARN_PREFIX,
        group: 'gbOwn.title',
        section: 'gbOwn.copySettings',
        label: 'gbOwn.copyWarnPrefix',
        hint: 'gbOwn.copyWarnPrefixHint',
        default: DEFAULT_COPY.warnPrefix,
        text: true,
      });
      ctx.settings.register({
        key: COPY_WARN_SUFFIX,
        group: 'gbOwn.title',
        section: 'gbOwn.copySettings',
        label: 'gbOwn.copyWarnSuffix',
        hint: 'gbOwn.copyWarnSuffixHint',
        default: DEFAULT_COPY.warnSuffix,
        text: true,
      });
      ctx.settings.register({
        key: COPY_MODE,
        group: 'gbOwn.title',
        section: 'gbOwn.copySettings',
        label: 'gbOwn.copyMode',
        default: DEFAULT_COPY.mode,
        choices: COPY_MODES.map(([value, label]) => ({ value, label })),
      });
      ctx.settings.register({
        key: COPY_MANUAL,
        group: 'gbOwn.title',
        section: 'gbOwn.copySettings',
        label: 'gbOwn.copyManualPlaces',
        hint: 'gbOwn.copyManualPlacesHint',
        default: [],
        min: 1,
        max: 5,
      });

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
        openPowerLevel: () => ctx.bus.emit('gbPowerLevel.open', {}),
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
          factorButtons: ctx.settings.numbers(FACTOR_BUTTONS),
          arcBonus: arcNow(),
          secureExisting: flag(SECURE, true),
          trust: flag(TRUST, false),
          oneFpForNoReward: ctx.settings.get(ONE_FP),
          exts: state.ext(d ?? '', openedLevel),
          copy: readCopyOptions(ctx.settings),
          copyPlayer: ctx.settings.text(COPY_PLAYER) || ctx.session.current?.name,
          copyBuilding: d ? ctx.ui.pref(copyBuildingKey(d)) : undefined,
          previewLevel: preview,
          greatBuilding: (id) => ctx.catalog.get(id)?.greatBuilding,
        });
      };
      const box = ctx.createBox({
        id: 'gbOwnShare',
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
        if (ctx.settings.get(AUTO_OPEN)) box.open();
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
      ctx.bus.on('catalog.updated', () => update());
      ctx.bus.on('city.ownChanged', () => update());
      // the other box changed the factors or Ext of the building
      ctx.bus.on('gbOwn.factorsChanged', () => update());
      ctx.bus.on('gbOwn.extChanged', () => update());
      ctx.settings.onChange((key) => {
        // the factor of the settings sets all five places alike again
        if (key === FACTOR || key === FACTOR_ARC) state.dropStandard();
        update();
      });
      ctx.menu.add({ id: 'gbOwnShare', icon: ICON, label: () => t('gbOwn.menu'), action: () => box.toggle() });
    },
  };
}

export const gbOwnShareFeature = createGbOwnShareFeature();
