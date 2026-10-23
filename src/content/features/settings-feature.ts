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
import { t } from '../core/texts';
import { FACTOR_STEP, percentOf } from '../ui/factor-bar';
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

    const box = ctx.createBox({
      id: 'settings',
      title: () => t('settings.title'),
      width: 340,
      render: () => {
        const groups = [...new Set(ctx.settings.defs.map((d) => d.group))];
        return html`${groups.map(
          (group) => html`<h2>${t(group)}</h2>
            ${ctx.settings.defs.filter((d) => d.group === group).map((d) => control(ctx.settings, d))}`,
        )}
        ${
          ctx.settings.get('core.record')
            ? html`<button class="action" @click=${() => ctx.recorder.save()}>${t('settings.saveRecording', { count: ctx.recorder.count })}</button>`
            : ''
        }`;
      },
    });
    ctx.settings.onChange(() => box.update());
    // the counter on the save button; update does nothing while the box is closed
    ctx.recorder.onChange(() => box.update());
    ctx.menu.add({ id: 'settings', icon: '⚙️', label: () => t('menu.settings'), action: () => box.toggle() });
  },
};
