import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { arcBonus } from '../../domain/gb-calculator';
import type { Construction } from '../../stores/great-building-model';
import { icons } from '../../ui/icons';
import { PlaceFactors } from './place-factors';
import { type OwnShareActions, ownShareView } from './view';
import {
  COPY_MODES,
  COPY_TOGGLES,
  type CopyMode,
  type CopyOptions,
  DEFAULT_COPY,
  ownShareViewModel,
} from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.gbOwnShare;

const FACTOR = 'gbOwn.factor';
const FACTOR_BUTTONS = 'gbOwn.factorButtons';
const AUTO_OPEN = 'gbOwn.autoOpen';
const ONE_FP = 'gbOwn.oneFpForNoReward';
const ARC_BUTTON = 'gbOwn.arcButton';
/** the Arc button is the chosen factor; its value comes from the city, so it follows the bonus */
const FACTOR_ARC = 'gbOwn.factorArc';
/** view choices, kept like the mode of a map rather than in the settings box */
const SECURE = 'gbOwn.secure';
const TRUST = 'gbOwn.trust';
const COPY_PLAYER = 'gbOwn.copy.playerName';
const COPY_MODE = 'gbOwn.copy.mode';
const COPY_MANUAL = 'gbOwn.copy.manual';
const COPY_WARN_PREFIX = 'gbOwn.copy.warnPrefix';
const COPY_WARN_SUFFIX = 'gbOwn.copy.warnSuffix';
const copyToggleKey = (option: string) => `gbOwn.copy.${option}`;
const copyBuildingKey = (def: string) => `gbOwn.copy.building.${def}`;
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
      /** promised payments per building and level; they are typed in for one level only */
      const exts = new Map<string, number[]>();
      const extKey = () => `${shown?.entityId}:${openedLevel}`;
      let copied: string | undefined;
      let copiedTimer: ReturnType<typeof setTimeout> | undefined;

      const flag = (key: string, fallback: boolean) => {
        const value = ctx.ui.pref(key);
        return value === undefined ? fallback : value === 'true';
      };
      const copyOptions = (): CopyOptions => ({
        ...(Object.fromEntries(COPY_TOGGLES.map(([o]) => [o, ctx.settings.get(copyToggleKey(o))])) as Omit<
          CopyOptions,
          'mode' | 'manual' | 'warnPrefix' | 'warnSuffix'
        >),
        warnPrefix: ctx.settings.text(COPY_WARN_PREFIX),
        warnSuffix: ctx.settings.text(COPY_WARN_SUFFIX),
        mode: ctx.settings.choice(COPY_MODE) as CopyMode,
        manual: ctx.settings.numbers(COPY_MANUAL),
      });
      const def = () => shown?.entity?.def;
      /** the five factors per building: standard, saved, changed */
      const factors = new PlaceFactors(ctx.ui, () => ({
        value: ctx.settings.number(FACTOR),
        arc: ctx.settings.get(FACTOR_ARC),
      }));
      /** a change to the factors of the building shown */
      const onFactors = (change: (d: string) => void) => () => {
        const d = def();
        if (!d) return;
        change(d);
        box.update();
      };

      const actions: OwnShareActions = {
        setFactor: (value) => onFactors((d) => factors.setAll(d, { value, arc: false }))(),
        useArc: () => onFactors((d) => factors.setAll(d, { value: 0, arc: true }))(),
        setPlaceFactor: (rank, value) => onFactors((d) => factors.setPlace(d, rank, value))(),
        saveFactors: onFactors((d) => factors.save(d)),
        resetFactors: onFactors((d) => factors.reset(d)),
        adoptFactors: onFactors((d) => factors.adopt(d)),
        setExt: (rank, fp) => {
          const list = [...(exts.get(extKey()) ?? [])];
          list[rank - 1] = fp;
          exts.set(extKey(), list);
          box.update();
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
      };
      const save = (key: string, value: string) => {
        ctx.ui.savePref(key, value);
        box.update();
      };

      const vm = () => {
        const d = def();
        return ownShareViewModel({
          construction: shown,
          openedLevel,
          greatBuildingName: (id) => ctx.catalog.greatBuildingName(id),
          factors: factors.state(d ?? ''),
          factorButtons: ctx.settings.numbers(FACTOR_BUTTONS),
          arcBonus: ctx.settings.get(ARC_BUTTON)
            ? arcBonus(ctx.cities.own(), ctx.greatBuildings.limitedBonuses())
            : undefined,
          secureExisting: flag(SECURE, true),
          trust: flag(TRUST, false),
          oneFpForNoReward: ctx.settings.get(ONE_FP),
          exts: exts.get(extKey()) ?? [],
          copy: copyOptions(),
          copyPlayer: ctx.settings.text(COPY_PLAYER) || ctx.session.current?.name,
          copyBuilding: d ? ctx.ui.pref(copyBuildingKey(d)) : undefined,
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
        if (ctx.settings.get(AUTO_OPEN)) box.open();
        else box.update();
      });
      ctx.bus.on('greatBuilding.changed', () => {
        if (follow()) box.update();
      });
      ctx.bus.on('catalog.updated', () => box.update());
      ctx.bus.on('city.ownChanged', () => box.update());
      ctx.settings.onChange((key) => {
        // the factor of the settings sets all five places alike again
        if (key === FACTOR || key === FACTOR_ARC) factors.dropStandard();
        box.update();
      });
      ctx.menu.add({ id: 'gbOwnShare', icon: ICON, label: () => t('gbOwn.menu'), action: () => box.toggle() });
    },
  };
}

export const gbOwnShareFeature = createGbOwnShareFeature();
