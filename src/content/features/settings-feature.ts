import { html } from 'lit-html';
import type { Feature } from '../core/feature';
import { logError } from '../core/log';
import {
  formatNumberList,
  isChoice,
  isList,
  isNumber,
  isText,
  parseNumberList,
  type SettingDef,
  type Settings,
} from '../core/settings';
import { t } from '../core/texts';
import { keepKeys } from '../ui/inputs';

const save = (settings: Settings, key: string, value: boolean | string | number | number[]) =>
  settings.set(key, value).catch((error) => logError('saving settings failed', error));

/** an empty or broken number keeps the stored value */
function saveNumber(settings: Settings, key: string, input: HTMLInputElement) {
  const value = input.valueAsNumber;
  if (Number.isFinite(value)) save(settings, key, value);
  else input.value = String(settings.number(key));
}

/** the stored list is cleaned when read, so an empty field gives the default again */
function saveList(settings: Settings, key: string, input: HTMLInputElement) {
  save(settings, key, parseNumberList(input.value));
  input.value = formatNumberList(settings.numbers(key));
}

const control = (settings: Settings, d: SettingDef) =>
  html`${input(settings, d)}${d.hint ? html`<p class="muted setting-hint">${t(d.hint)}</p>` : ''}`;

const input = (settings: Settings, d: SettingDef) =>
  isText(d)
    ? html`<label>${t(d.label)}<input type="text" .value=${settings.text(d.key)} @keydown=${keepKeys}
        @change=${(e: Event) => save(settings, d.key, (e.target as HTMLInputElement).value)} /></label>`
    : isList(d)
      ? html`<label>${t(d.label)}<input type="text" .value=${formatNumberList(settings.numbers(d.key))}
        @keydown=${keepKeys} @change=${(e: Event) => saveList(settings, d.key, e.target as HTMLInputElement)} /></label>`
      : isNumber(d)
        ? html`<label>${t(d.label)}<input type="number" min=${d.min} max=${d.max} step=${d.step ?? 1} .value=${String(settings.number(d.key))}
        @keydown=${keepKeys} @change=${(e: Event) => saveNumber(settings, d.key, e.target as HTMLInputElement)} /></label>`
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
