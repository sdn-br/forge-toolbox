// Covers the contribution buttons of the game's great building window while it shows a building of another player
// that is ignored, or whose owner is ignored. Like the attack warning, the cover is fixed: the game draws the window in
// a fixed size around the middle of the page (measured 2026-11-04 on de10 at four window sizes). The cover goes with
// the window (gbWindow.changed leaves 'foreign'), with "pay in anyway", or when another building opens.
import { html, render } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import type { Feature } from '../../core/feature';
import { t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { baseCss } from '../../ui/styles';
import { contributionRowCss } from '../shared/contribution-row';

const css = `
.cover { z-index: 2147479000;
  ${contributionRowCss}
  display: flex; align-items: center; gap: 8px; padding: 0 8px; background: var(--bg); color: var(--ink);
  border: 2px solid var(--bad); border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5);
  font: 12px/1.4 system-ui, sans-serif; }
.cover svg { flex: 0 0 auto; width: 20px; height: 20px; }
.cover p { flex: 1 1 auto; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cover button.action { flex: 0 0 auto; margin: 0; }
`;

export const contributionWarningFeature: Feature = {
  id: 'contribution-warning',
  setup(ctx) {
    const host = document.createElement('div');
    host.dataset.forgeToolbox = 'contribution-warning';
    const shadow = host.attachShadow({ mode: 'open' });

    /** the foreign building the game shows, as the last greatBuilding.opened said */
    let open: { owner: PlayerId; entityId: number } | undefined;
    /** the player chose "pay in anyway" for the open building */
    let dismissed = false;

    const hide = () => host.remove();
    const show = (text: string) => {
      render(
        html`<style>${baseCss}${css}</style>
          <div class="cover" role="alert">
            ${headerIcons.attackWarning}
            <p>${text}</p>
            <button class="action" @click=${dismiss}>${t('contributionWarning.payAnyway')}</button>
          </div>`,
        shadow,
      );
      document.documentElement.append(host);
    };
    const dismiss = () => {
      dismissed = true;
      hide();
    };

    /** shows or hides the cover for the open building; the owner's name is named first when both are ignored */
    const evaluate = () => {
      if (!open || dismissed) return hide();
      if (ctx.players.flag(open.owner, 'ignored')) {
        const name = ctx.players.get(open.owner)?.name;
        return show(name ? t('contributionWarning.player', { name }) : t('contributionWarning.playerUnnamed'));
      }
      if (ctx.greatBuildings.isIgnored(open.owner, open.entityId)) return show(t('contributionWarning.building'));
      hide();
    };

    ctx.bus.on('greatBuilding.opened', ({ owner, entityId, own }) => {
      open = own ? undefined : { owner, entityId };
      dismissed = false;
      evaluate();
    });
    ctx.bus.on('gbWindow.changed', ({ state }) => {
      if (state === 'foreign') return;
      open = undefined;
      hide();
    });
    ctx.bus.on('greatBuilding.ignored', ({ owner, entityId }) => {
      if (open?.owner === owner && open.entityId === entityId) evaluate();
    });
    ctx.bus.on('player.updated', ({ ids }) => {
      if (open && ids.includes(open.owner)) evaluate();
    });
  },
};
