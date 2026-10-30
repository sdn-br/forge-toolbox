// The recording of the game traffic: the two switches and, while recording, the buttons that save or clear what was
// recorded. The recorder itself is a core service (core/recorder.ts); the content script reads the switches.
import { html } from 'lit-html';
import type { Feature } from '../../core/feature';
import { toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';

/** the recording of the game traffic, and whether it holds the requests too; the recorder reads them */
export const RECORD = toggleDef({
  key: 'core.record',
  group: 'settings.core',
  label: 'settings.recordTraffic',
  default: false,
});
export const RECORD_REQUESTS = toggleDef({
  key: 'core.recordRequests',
  group: 'settings.core',
  label: 'settings.recordRequests',
  default: false,
});

export const recorderFeature: Feature = {
  id: 'recorder',
  setup(ctx) {
    const record = ctx.settings.register(RECORD);
    ctx.settings.register(RECORD_REQUESTS);
    ctx.settingsControls.add({
      group: 'settings.core',
      render: () =>
        record.get()
          ? html`<button class="action icon-only" data-tip=${t('settings.saveRecording', { count: ctx.recorder.count })}
              aria-label=${t('settings.saveRecording', { count: ctx.recorder.count })}
              @click=${() => ctx.recorder.save()}>${headerIcons.download}${ctx.recorder.count}</button>
            <button class="action icon-only"
              aria-disabled=${ctx.recorder.count ? 'false' : 'true'} data-tip=${t('settings.clearRecording')}
              aria-label=${t('settings.clearRecording')}
              @click=${() => ctx.recorder.clear()}>${headerIcons.trash}</button>`
          : '',
    });
    // the counter on the save button; a redraw does nothing while the box is closed
    ctx.recorder.onChange(() => ctx.settingsControls.update());
  },
};
