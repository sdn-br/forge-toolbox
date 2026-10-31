import { html } from 'lit-html';
import { BACKUP_SETTING } from '../../backup/backup-copy';
import type { FeatureContext } from '../../core/feature';
import { saveSetting } from '../../core/settings';
import type { SettingsControl } from '../../core/settings-controls';
import { t } from '../../core/texts';

/**
 * "Sicherungskopie auf der Spielseite" and "Gefundene Daten übernehmen" in the data section of the settings: switching
 * the copy on saves at once, switching off asks in a line of its own first, since it deletes the copy. The question
 * stays through redraws until it is answered, the box shows another group or closes.
 */
export function backupSettingsControl(ctx: FeatureContext): SettingsControl {
  const setting = ctx.settings.of(BACKUP_SETTING);
  let asking = false;
  const ask = (value: boolean) => {
    asking = value;
    ctx.settingsControls.update();
  };
  const save = (value: boolean) => saveSetting(setting, value);
  const change = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.checked) {
      asking = false;
      save(true);
      return;
    }
    // stays on until the answer
    input.checked = true;
    ask(true);
  };
  const switchOff = () => {
    asking = false;
    save(false);
  };
  return {
    group: 'settings.core',
    section: 'settings.data',
    claims: [BACKUP_SETTING],
    render: () =>
      html`<label><input type="checkbox" .checked=${setting.get()} @change=${change} />${t('settings.backupCopy')}</label>
        ${
          asking
            ? html`<p class="warn">${t('settings.backupCopyOffConfirm')}
                <span class="answers"><button class="action" @click=${switchOff}>${t('settings.backupCopyOff')}</button>
                <button class="action" @click=${() => ask(false)}>${t('settings.backupCopyCancel')}</button></span></p>`
            : html`<p class="muted setting-hint">${t('settings.backupCopyHint')}</p>`
        }
        <button class="action" @click=${() => ctx.open('backupCopy')}>${t('settings.findData')}</button>
        <p class="muted setting-hint">${t('settings.findDataHint')}</p>`,
    reset: () => {
      asking = false;
    },
  };
}
