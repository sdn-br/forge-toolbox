import { html } from 'lit-html';
import type { Feature } from '../core/feature';
import { isChoice, type SettingDef, type Settings } from '../core/settings';
import { t } from '../core/texts';

const control = (settings: Settings, d: SettingDef) =>
  isChoice(d)
    ? html`<label>${t(d.label)}<select @change=${(e: Event) => settings.set(d.key, (e.target as HTMLSelectElement).value)}>
        ${d.choices.map((c) => html`<option value=${c.value} .selected=${settings.choice(d.key) === c.value}>${t(c.label)}</option>`)}
      </select></label>`
    : html`<label><input type="checkbox" .checked=${settings.get(d.key)}
        @change=${(e: Event) => settings.set(d.key, (e.target as HTMLInputElement).checked)} />${t(d.label)}</label>`;

export const settingsFeature: Feature = {
  id: 'settings',
  setup(ctx) {
    ctx.settings.register({
      key: 'core.record',
      group: 'settings.core',
      label: 'settings.recordTraffic',
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
