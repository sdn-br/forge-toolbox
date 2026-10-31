import { html } from 'lit-html';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { listDef, numberDef, toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { icons } from '../../ui/icons';
import { playTone } from '../../ui/sound';
import { createCalculatorSection } from './calculator/section';
import { type FoldEvent, foldReducer, foldView, initialFold } from './fold-state';
import { gbShared } from './lookups';
import { createSnipeSection } from './snipe/section';
import { gbCalculatorCss } from './styles';

/** the menu entry and the settings group show it */
const ICON = icons.gbCalculator;

export const FACTOR = numberDef({
  key: 'gbCalc.factor',
  group: 'gbCalc.title',
  label: 'gbCalc.factorSetting',
  default: 90,
  min: -100,
  max: 200,
  step: 0.1,
  asFactor: true,
});
export const FACTOR_ARC = toggleDef({
  key: 'gbCalc.factorArc',
  group: 'gbCalc.title',
  label: 'gbCalc.factorArcSetting',
  default: false,
});
export const FACTOR_BUTTONS = listDef({
  key: 'gbCalc.factorButtons',
  group: 'gbCalc.title',
  label: 'gbCalc.factorButtonsSetting',
  hint: 'gbCalc.factorButtonsHint',
  default: [80, 90, 100],
  min: -100,
  max: 200,
  step: 0.1,
  asFactor: true,
});
export const ARC_BUTTON = toggleDef({
  key: 'gbCalc.arcButton',
  group: 'gbCalc.title',
  label: 'gbCalc.arcButtonSetting',
  default: true,
});
export const SOUND = toggleDef({
  key: 'gbCalc.sound',
  group: 'gbCalc.title',
  label: 'gbCalc.soundSetting',
  default: true,
});
export const CLOSE_WITHOUT_WINDOW = toggleDef({
  key: 'gbCalc.closeWithoutWindow',
  group: 'gbCalc.title',
  label: 'gbCalc.closeWithoutWindowSetting',
  default: true,
});
export const RETENTION = numberDef({
  key: 'snipe.retentionDays',
  group: 'gbCalc.title',
  section: 'snipe.section',
  label: 'snipe.retentionSetting',
  default: 30,
  min: 1,
  max: 365,
});
export const SNIPE_OPEN = toggleDef({
  key: 'snipe.open',
  group: 'gbCalc.title',
  section: 'snipe.section',
  label: 'snipe.openSetting',
  default: true,
});
export const SNIPE_SOUND = toggleDef({
  key: 'snipe.sound',
  group: 'gbCalc.title',
  section: 'snipe.section',
  label: 'snipe.soundSetting',
  default: true,
});

/** `tone` plays the sound for a profitable place; tests pass their own. */
export function createGbCalculatorFeature(tone: () => void = playTone): Feature {
  return {
    id: 'gbCalculator',
    setup(ctx) {
      ctx.settings.registerGroup('gbCalc.title', ICON);
      const factor = ctx.settings.register(FACTOR);
      const factorArc = ctx.settings.register(FACTOR_ARC);
      const factorButtons = ctx.settings.register(FACTOR_BUTTONS);
      const arcButton = ctx.settings.register(ARC_BUTTON);
      const sound = ctx.settings.register(SOUND);
      const closeWithoutWindow = ctx.settings.register(CLOSE_WITHOUT_WINDOW);
      const retention = ctx.settings.register(RETENTION);
      const snipeOpen = ctx.settings.register(SNIPE_OPEN);
      const snipeSound = ctx.settings.register(SNIPE_SOUND);
      // buildings of other players not seen for that long go; those with an own contribution stay
      ctx.greatBuildings.prune(retention.get()).catch((error) => logError('pruning great buildings failed', error));

      /** which part is folded; the rules are in fold-state.ts */
      let fold = initialFold;
      const content = () => ({ hasList: snipe.hasList(), hasBuilding: calc.hasBuilding() });
      const dispatch = (event: FoldEvent) => {
        fold = foldReducer(fold, event);
      };

      const box = ctx.createBox({
        id: 'gbCalculator',
        css: gbCalculatorCss,
        settings: 'gbCalc.title',
        title: () => t('gbCalc.title'),
        // the snipe table: fixed columns of 518 px and the building name with its 16 px eye; until 2026-10-25 a CSS cap held fixed boxes at 520 px
        width: 618,
        // 6 table rows, the section and the calculator fit without the body scrolling on a normal window
        maxHeight: 0.92,
        render: () => {
          const show = foldView(fold, content());
          return html`${snipe.render(show.snipe)}${calc.render(show.calc, toggleCalc)}`;
        },
      });

      const refresh = () => {
        const shared = gbShared(ctx, Date.now());
        calc.update(shared);
        snipe.update(shared);
        box.update();
      };
      const toggleCalc = () => {
        dispatch({ type: 'toggleCalc' });
        box.update();
      };

      // the snipe section first: a building of its list it reads anew before the calculator follows the building
      const snipe = createSnipeSection(
        ctx,
        box,
        { open: snipeOpen, sound: snipeSound },
        {
          refresh,
          listArrived: () => dispatch({ type: 'listArrived' }),
          toggle: () => {
            dispatch({ type: 'toggleSnipe' });
            box.update();
          },
          tone,
        },
      );
      const calc = createCalculatorSection(
        ctx,
        box,
        { factor, factorArc, factorButtons, arcButton, sound },
        {
          refresh,
          followed: (owner) => dispatch({ type: 'buildingOpened', ofListOwner: snipe.listOwner() === owner }),
          tone,
        },
      );

      // the window the game shows wins over the traffic: the list unfolds its section, a foreign building the calculator;
      // without either the box closes. It never opens the box, so ignored buildings and players keep it closed.
      ctx.bus.on('gbWindow.changed', ({ state }) => {
        dispatch({ type: 'window', state, ...content() });
        if (state !== 'list' && state !== 'foreign' && box.isOpen && closeWithoutWindow.get()) box.close();
        box.update();
      });
      ctx.bus.on('greatBuilding.marked', refresh);
      ctx.bus.on('greatBuilding.ignored', refresh);
      ctx.bus.on('resources.changed', refresh);
      ctx.bus.on('inventory.changed', refresh);
      ctx.bus.on('city.ownChanged', refresh);
      ctx.bus.on('catalog.updated', refresh);
      ctx.bus.on('player.updated', refresh);
      ctx.bus.on('foestats.updated', ({ player }) => {
        if (player === calc.shown()?.owner || player === snipe.listOwner()) refresh();
      });
      ctx.settings.onChange(refresh);
      ctx.menu.add({ id: 'gbCalculator', icon: ICON, label: () => t('gbCalc.menu'), action: () => box.toggle() });
    },
  };
}

export const gbCalculatorFeature = createGbCalculatorFeature();
