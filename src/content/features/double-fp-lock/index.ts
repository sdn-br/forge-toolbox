// After the player pays Forge points into a great building of another player, a bar covers the game's contribution row
// for a few seconds, so a double click cannot pay twice. It starts when the request leaves (greatBuilding.contributing),
// before the game's answer, so a second click while the answer is on its way is covered too. A new contribution
// restarts it. It goes when the time is up or when the game window turns away from a foreign building. Own buildings
// are never locked.
import { html, render } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import type { Feature } from '../../core/feature';
import { numberDef } from '../../core/settings';
import { t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { baseCss } from '../../ui/styles';
import { contributionRowCss } from '../shared/contribution-row';

export const LOCK_SECONDS = numberDef({
  key: 'doubleFpLock.seconds',
  group: 'gbCalc.title',
  section: 'doubleFpLock.section',
  label: 'doubleFpLock.secondsSetting',
  hint: 'doubleFpLock.secondsHint',
  default: 2,
  min: 0,
  max: 30,
});

// above the contribution warning (2147479000), which a paid-in building rarely still shows
const css = `
.lock { z-index: 2147479500; pointer-events: auto;
  ${contributionRowCss}
  display: flex; align-items: center; gap: 8px; padding: 0 8px; background: var(--bg); color: var(--ink);
  border: 2px solid var(--warn); border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5); overflow: hidden;
  font: 12px/1.4 system-ui, sans-serif; }
.lock svg { flex: 0 0 auto; width: 20px; height: 20px; }
.lock p { flex: 1 1 auto; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run { position: absolute; left: 0; bottom: 0; width: 100%; height: 3px; background: var(--warn);
  transform-origin: left; animation: run linear forwards; }
@keyframes run { from { transform: scaleX(1); } to { transform: scaleX(0); } }
`;

export const doubleFpLockFeature: Feature = {
  id: 'double-fp-lock',
  setup(ctx) {
    const seconds = ctx.settings.register(LOCK_SECONDS);
    const host = document.createElement('div');
    host.dataset.forgeToolbox = 'double-fp-lock';
    const shadow = host.attachShadow({ mode: 'open' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** a new key restarts the run-down animation */
    let round = 0;

    const hide = () => {
      clearTimeout(timer);
      timer = undefined;
      host.remove();
    };
    const lock = (duration: number) => {
      clearTimeout(timer);
      render(
        html`<style>${baseCss}${css}</style>
          <div class="lock" role="status">
            ${headerIcons.lock}
            <p>${t('doubleFpLock.text')}</p>
            ${keyed(++round, html`<div class="run" style="animation-duration: ${duration}s"></div>`)}
          </div>`,
        shadow,
      );
      document.documentElement.append(host);
      timer = setTimeout(hide, duration * 1000);
    };

    ctx.bus.on('greatBuilding.contributing', ({ own }) => {
      const duration = seconds.get();
      if (!own && duration > 0) lock(duration);
    });
    ctx.bus.on('gbWindow.changed', ({ state }) => {
      if (state !== 'foreign') hide();
    });
  },
};
