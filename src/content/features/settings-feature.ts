import { html } from 'lit-html';
import type { Feature } from '../core/feature';
import { logError } from '../core/log';
import {
  formatNumberList,
  isChoice,
  isList,
  isNumber,
  isText,
  type ListSettingDef,
  type NumberSettingDef,
  parseNumberList,
  type SettingDef,
  type Settings,
} from '../core/settings';
import { type TextKey, t } from '../core/texts';
import { FACTOR_STEP, percentOf } from '../ui/factor-bar';
import { headerIcons, icons } from '../ui/icons';
import { keepKeys } from '../ui/inputs';

const save = (settings: Settings, key: string, value: boolean | string | number | number[]) =>
  settings.set(key, value).catch((error) => logError('saving settings failed', error));

type NumberDef = NumberSettingDef | ListSettingDef;

/** a value as the settings box shows it: a factor setting reads 90 as 1,9 */
const shown = (d: NumberDef, n: number) => (d.asFactor ? (100 + n) / 100 : n);
const stored = (d: NumberDef, n: number) => (d.asFactor ? percentOf(n) : n);

/** an empty or broken number keeps the stored value */
function saveNumber(settings: Settings, d: NumberSettingDef, input: HTMLInputElement) {
  const value = input.valueAsNumber;
  if (Number.isFinite(value)) save(settings, d.key, stored(d, value));
  else input.value = String(shown(d, settings.number(d.key)));
}

const listText = (settings: Settings, d: ListSettingDef) =>
  formatNumberList(settings.numbers(d.key).map((n) => shown(d, n)));

/** the stored list is cleaned when read, so an empty field gives the default again */
function saveList(settings: Settings, d: ListSettingDef, input: HTMLInputElement) {
  save(
    settings,
    d.key,
    parseNumberList(input.value).map((n) => stored(d, n)),
  );
  input.value = listText(settings, d);
}

const control = (settings: Settings, d: SettingDef) =>
  html`${input(settings, d)}${d.hint ? html`<p class="muted setting-hint">${t(d.hint)}</p>` : ''}`;

const input = (settings: Settings, d: SettingDef) =>
  isText(d)
    ? html`<label>${t(d.label)}<input type="text" .value=${settings.text(d.key)} @keydown=${keepKeys}
        @change=${(e: Event) => save(settings, d.key, (e.target as HTMLInputElement).value)} /></label>`
    : isList(d)
      ? html`<label>${t(d.label)}<input type="text" .value=${listText(settings, d)}
        @keydown=${keepKeys} @change=${(e: Event) => saveList(settings, d, e.target as HTMLInputElement)} /></label>`
      : isNumber(d)
        ? html`<label>${t(d.label)}<input type="number" min=${shown(d, d.min)} max=${shown(d, d.max)}
        step=${d.asFactor ? FACTOR_STEP : (d.step ?? 1)} .value=${String(shown(d, settings.number(d.key)))}
        @keydown=${keepKeys} @change=${(e: Event) => saveNumber(settings, d, e.target as HTMLInputElement)} /></label>`
        : isChoice(d)
          ? html`<label>${t(d.label)}<select @change=${(e: Event) => save(settings, d.key, (e.target as HTMLSelectElement).value)}>
        ${d.choices.map((c) => html`<option value=${c.value} .selected=${settings.choice(d.key) === c.value}>${t(c.label)}</option>`)}
      </select></label>`
          : html`<label><input type="checkbox" .checked=${settings.get(d.key)}
        @change=${(e: Event) => save(settings, d.key, (e.target as HTMLInputElement).checked)} />${t(d.label)}</label>`;

/** the menu entry and the general settings show it */
const ICON = icons.settings;
/** the menu's icon size in pixels, as a choice */
const MENU_SIZE = 'core.menuSize';
/** the view choice of the group shown */
const TAB = 'settings.group';

export const settingsFeature: Feature = {
  id: 'settings',
  setup(ctx) {
    ctx.settings.register({
      key: 'core.record',
      group: 'settings.core',
      label: 'settings.recordTraffic',
      default: false,
    });
    ctx.settings.register({
      key: 'core.recordRequests',
      group: 'settings.core',
      label: 'settings.recordRequests',
      default: false,
    });

    ctx.settings.register({
      key: MENU_SIZE,
      group: 'settings.core',
      label: 'settings.menuSize',
      default: '35',
      choices: [
        { value: '30', label: 'settings.menuSize30' },
        { value: '35', label: 'settings.menuSize35' },
        { value: '45', label: 'settings.menuSize45' },
      ],
    });
    const applyMenuSize = () => ctx.menu.setIconSize(Number(ctx.settings.choice(MENU_SIZE)));
    applyMenuSize();
    ctx.settings.onChange((key) => key === MENU_SIZE && applyMenuSize());

    ctx.settings.registerGroup('settings.core', ICON);

    /** the group shown, kept across page loads; a box's settings button picks the group of its feature */
    const shownGroup = (groups: string[]) => {
      const chosen = ctx.ui.pref(TAB);
      return chosen && groups.includes(chosen) ? chosen : groups[0];
    };
    const select = (group: string) => {
      ctx.ui.savePref(TAB, group);
      box.update();
    };
    const box = ctx.createBox({
      id: 'settings',
      title: () => t('settings.title'),
      width: 380,
      maxHeight: 0.8,
      render: () => {
        // the general settings first, then the features in the order they registered
        const groups = [...new Set(['settings.core', ...ctx.settings.defs.map((d) => d.group)])];
        const group = shownGroup(groups);
        const defs = ctx.settings.defs.filter((d) => d.group === group);
        const sections = [...new Set(defs.map((d) => d.section).filter((s) => s !== undefined))];
        return html`<div class="settings-layout">
          <nav class="settings-nav">${groups.map(
            (g) => html`<button class=${g === group ? 'active' : ''} data-tip=${t(g as TextKey)}
              aria-label=${t(g as TextKey)} @click=${() => select(g)}>${ctx.settings.groupIcon(g) ?? '•'}</button>`,
          )}</nav>
          <div class="settings-main">
            <h2>${t(group as TextKey)}</h2>
            ${defs.filter((d) => d.section === undefined).map((d) => control(ctx.settings, d))}
            ${sections.map(
              (section) => html`<h3>${t(section)}</h3>
                ${defs.filter((d) => d.section === section).map((d) => control(ctx.settings, d))}`,
            )}
            ${
              group === 'settings.core' && ctx.settings.get('core.record')
                ? html`<button class="action icon-only" data-tip=${t('settings.saveRecording', { count: ctx.recorder.count })}
                    aria-label=${t('settings.saveRecording', { count: ctx.recorder.count })}
                    @click=${() => ctx.recorder.save()}>${headerIcons.download}${ctx.recorder.count}</button>
                  <button class="action icon-only"
                    aria-disabled=${ctx.recorder.count ? 'false' : 'true'} data-tip=${t('settings.clearRecording')}
                    aria-label=${t('settings.clearRecording')}
                    @click=${() => ctx.recorder.clear()}>${headerIcons.trash}</button>`
                : ''
            }
          </div>
        </div>`;
      },
    });
    ctx.settings.onChange(() => box.update());
    // the counter on the save button; update does nothing while the box is closed
    ctx.recorder.onChange(() => box.update());
    ctx.bus.on('settings.open', ({ group }) => {
      ctx.ui.savePref(TAB, group);
      box.open();
    });
    ctx.menu.add({ id: 'settings', icon: ICON, label: () => t('menu.settings'), action: () => box.toggle() });
  },
};
