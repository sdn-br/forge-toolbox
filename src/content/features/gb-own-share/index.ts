import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { arcBonus } from '../../domain/gb-calculator';
import type { Construction } from '../../stores/great-building-model';
import { type OwnShareActions, ownShareView } from './view';
import {
  COPY_MODES,
  COPY_TOGGLES,
  type CopyMode,
  type CopyOptions,
  DEFAULT_COPY,
  ownShareViewModel,
} from './view-model';

const FACTOR = 'gbOwn.factor';
const FACTOR_BUTTONS = 'gbOwn.factorButtons';
const AUTO_OPEN = 'gbOwn.autoOpen';
const ARC_BUTTON = 'gbOwn.arcButton';
/** the Arc button is the chosen factor; its value comes from the city, so it follows the bonus */
const FACTOR_ARC = 'gbOwn.factorArc';
/** view choices, kept like the mode of a map rather than in the settings box */
const SECURE = 'gbOwn.secure';
const TRUST = 'gbOwn.trust';
const COPY_GROUP = 'gbOwn.copySettings';
const COPY_PLAYER = 'gbOwn.copy.playerName';
const COPY_MODE = 'gbOwn.copy.mode';
const COPY_MANUAL = 'gbOwn.copy.manual';
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
      ctx.settings.register({
        key: FACTOR,
        group: 'gbOwn.title',
        label: 'gbOwn.factorSetting',
        default: 90,
        min: -100,
        max: 200,
        step: 0.1,
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
      });
      ctx.settings.register({ key: ARC_BUTTON, group: 'gbOwn.title', label: 'gbCalc.arcButtonSetting', default: true });
      ctx.settings.register({ key: FACTOR_ARC, group: 'gbOwn.title', label: 'gbOwn.factorArcSetting', default: false });
      ctx.settings.register({ key: AUTO_OPEN, group: 'gbOwn.title', label: 'gbOwn.autoOpenSetting', default: true });

      ctx.settings.register({
        key: COPY_PLAYER,
        group: COPY_GROUP,
        label: 'gbOwn.copyPlayerName',
        hint: 'gbOwn.copyPlayerNameHint',
        default: '',
        text: true,
      });
      for (const [option, label] of COPY_TOGGLES)
        ctx.settings.register({ key: copyToggleKey(option), group: COPY_GROUP, label, default: DEFAULT_COPY[option] });
      ctx.settings.register({
        key: COPY_MODE,
        group: COPY_GROUP,
        label: 'gbOwn.copyMode',
        default: DEFAULT_COPY.mode,
        choices: COPY_MODES.map(([value, label]) => ({ value, label })),
      });
      ctx.settings.register({
        key: COPY_MANUAL,
        group: COPY_GROUP,
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
          'mode' | 'manual'
        >),
        mode: ctx.settings.choice(COPY_MODE) as CopyMode,
        manual: ctx.settings.numbers(COPY_MANUAL),
      });
      const def = () => shown?.entity?.def;

      const actions: OwnShareActions = {
        setFactor: (value) => {
          setting(FACTOR, value);
          setting(FACTOR_ARC, false);
        },
        useArc: () => setting(FACTOR_ARC, true),
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
      const setting = (key: string, value: boolean | number) =>
        ctx.settings.set(key, value).catch((error) => logError('saving settings failed', error));
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
          factor: { value: ctx.settings.number(FACTOR), arc: ctx.settings.get(FACTOR_ARC) },
          factorButtons: ctx.settings.numbers(FACTOR_BUTTONS),
          arcBonus: ctx.settings.get(ARC_BUTTON)
            ? arcBonus(ctx.cities.own(), ctx.greatBuildings.limitedBonuses())
            : undefined,
          secureExisting: flag(SECURE, true),
          trust: flag(TRUST, false),
          exts: exts.get(extKey()) ?? [],
          copy: copyOptions(),
          copyPlayer: ctx.settings.text(COPY_PLAYER) || ctx.session.current?.name,
          copyBuilding: d ? ctx.ui.pref(copyBuildingKey(d)) : undefined,
        });
      };
      const box = ctx.createBox({
        id: 'gbOwnShare',
        title: () => t('gbOwn.title'),
        width: 460,
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
      ctx.settings.onChange(() => box.update());
      ctx.menu.add({ id: 'gbOwnShare', icon: '🧱', label: () => t('gbOwn.menu'), action: () => box.toggle() });
    },
  };
}

export const gbOwnShareFeature = createGbOwnShareFeature();
