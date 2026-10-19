import { html } from 'lit-html';
import type { Feature } from '../core/feature';
import { t } from '../core/texts';

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
            ${ctx.settings.defs
              .filter((d) => d.group === group)
              .map(
                (d) => html`<label><input type="checkbox" .checked=${ctx.settings.get(d.key)}
                  @change=${(e: Event) => ctx.settings.set(d.key, (e.target as HTMLInputElement).checked)} />${t(d.label)}</label>`,
              )}`,
        )}
        ${
          ctx.settings.get('core.record')
            ? html`<button class="action" @click=${() => ctx.recorder.save()}>${t('settings.saveRecording', { count: ctx.recorder.count })}</button>`
            : ''
        }`;
      },
    });
    ctx.settings.onChange(() => box.update());
    ctx.menu.add({ id: 'settings', icon: '⚙️', label: () => t('menu.settings'), action: () => box.toggle() });
  },
};
