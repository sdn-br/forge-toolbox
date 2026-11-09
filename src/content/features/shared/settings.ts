import { listDef, numberDef, type Settings, toggleDef } from '../../core/settings';
import { type FactorChoice, GOLD_FACTOR } from '../../domain/gb-factor';

/** Off: no requests to foestats, and the views hide what they know from it. Links to foestats stay. */
export const FOESTATS_SETTING = toggleDef({
  key: 'foestats.fetch',
  group: 'foestats.group',
  label: 'foestats.fetchSetting',
  hint: 'foestats.fetchHint',
  default: true,
});

/** the settings of the Eigenanteil group the factors rest on */
export const FACTOR = numberDef({
  key: 'gbOwn.factor',
  group: 'gbOwn.title',
  label: 'gbOwn.factorSetting',
  default: 90,
  min: -100,
  max: 200,
  step: 0.1,
  asFactor: true,
});
export const FACTOR_BUTTONS = listDef({
  key: 'gbOwn.factorButtons',
  group: 'gbOwn.title',
  label: 'gbCalc.factorButtonsSetting',
  hint: 'gbCalc.factorButtonsHint',
  default: [80, 90, 100],
  min: -100,
  max: 200,
  step: 0.1,
  asFactor: true,
});
/** the fixed factor and the buttons on gold levels, where the Arc bonus is 0 to 50 % (Nutzer, 2026-11-05) */
export const FACTOR_GOLD = numberDef({
  key: 'gbOwn.factorGold',
  group: 'gbOwn.title',
  label: 'gbOwn.factorGoldSetting',
  default: GOLD_FACTOR,
  min: 0,
  max: 100,
  step: 0.1,
  asFactor: true,
});
export const FACTOR_BUTTONS_GOLD = listDef({
  key: 'gbOwn.factorButtonsGold',
  group: 'gbOwn.title',
  label: 'gbCalc.factorButtonsGoldSetting',
  hint: 'gbCalc.factorButtonsGoldHint',
  default: [10, 15, 20],
  min: 0,
  max: 100,
  step: 1,
  asFactor: true,
});
export const ARC_BUTTON = toggleDef({
  key: 'gbOwn.arcButton',
  group: 'gbOwn.title',
  label: 'gbCalc.arcButtonSetting',
  default: true,
});
export const FACTOR_ARC = toggleDef({
  key: 'gbOwn.factorArc',
  group: 'gbOwn.title',
  label: 'gbOwn.factorArcSetting',
  default: false,
});
export const ONE_FP = toggleDef({
  key: 'gbOwn.oneFpForNoReward',
  group: 'gbOwn.title',
  label: 'gbOwn.oneFpSetting',
  hint: 'gbOwn.oneFpHint',
  default: true,
});

/** the factor of the settings, the single factor of the places of the own-share state; read lazily, on every call */
export const singleFactor =
  (settings: Settings): (() => FactorChoice) =>
  () => ({
    value: settings.of(FACTOR).get(),
    arc: settings.of(FACTOR_ARC).get(),
    gold: settings.of(FACTOR_GOLD).get(),
  });
