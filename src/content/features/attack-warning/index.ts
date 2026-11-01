// Covers the three buttons of the game's army window (attack, auto battle, replace units) while it prepares a battle
// against a player marked not to attack. Like a game window, the cover is fixed: the game draws the army window in a
// fixed size around the middle of the page, so the buttons always lie at the same place relative to it (measured
// 2026-11-01 on de10 at three window sizes). The opponent comes from the game engine (army.target); without it no cover
// shows. The cover goes with the window (army.closed), with the start of a battle or with "fight anyway".
import { html, render } from 'lit-html';
import type { Feature } from '../../core/feature';
import { t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { baseCss } from '../../ui/styles';

// debt: the place of the buttons is measured, not read. ceiling: a game update that resizes the army window moves
// the buttons out from under the cover. upgrade: measure again, or read the button bounds from the engine.
const css = `
.cover { position: fixed; z-index: 2147479000; box-sizing: border-box;
  /* the window's top edge is 307 px above the middle, but not above 8 px; the button row starts 561 px below it */
  top: calc(max(8px, 50vh - 307px) + 554px); left: calc(50vw - 249px); width: 540px; height: 37px;
  display: flex; align-items: center; gap: 8px; padding: 0 8px; background: var(--bg); color: var(--ink);
  border: 2px solid var(--bad); border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5);
  font: 12px/1.4 system-ui, sans-serif; }
.cover svg { flex: 0 0 auto; width: 20px; height: 20px; }
.cover p { flex: 1 1 auto; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cover button.action { flex: 0 0 auto; margin: 0; }
`;

export const attackWarningFeature: Feature = {
  id: 'attack-warning',
  setup(ctx) {
    const host = document.createElement('div');
    host.dataset.forgeToolbox = 'attack-warning';
    const shadow = host.attachShadow({ mode: 'open' });

    const hide = () => host.remove();
    const show = (name: string | undefined) => {
      const text = name ? t('attackWarning.named', { name }) : t('attackWarning.unnamed');
      render(
        html`<style>${baseCss}${css}</style>
          <div class="cover" role="alert">
            ${headerIcons.attackWarning}
            <p>${text}</p>
            <button class="action" @click=${hide}>${t('attackWarning.fightAnyway')}</button>
          </div>`,
        shadow,
      );
      document.documentElement.append(host);
    };

    ctx.bus.on('army.target', ({ opponent }) => {
      if (ctx.players.noAttack(opponent)) show(ctx.players.get(opponent)?.name);
      else hide();
    });
    ctx.bus.on('army.opened', hide);
    ctx.bus.on('army.closed', hide);
    ctx.bus.on('battle.started', hide);
  },
};
