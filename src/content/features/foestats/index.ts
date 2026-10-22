import type { PlayerId } from '../../../shared/ids';
import type { Feature } from '../../core/feature';
import { FOESTATS_SETTING } from '../../stores/foestats';

/**
 * Asks foestats about the players the viewer looks at: the owner of a foreign great building opened in the game and
 * the player of a visited city. Nothing in the background, no neighbours or guild members ahead of time.
 */
export const foestatsFeature: Feature = {
  id: 'foestats',
  setup(ctx) {
    ctx.settings.register(FOESTATS_SETTING);
    const view = (player: PlayerId) => {
      if (ctx.settings.get(FOESTATS_SETTING.key)) void ctx.foestats.view(player);
    };
    ctx.bus.on('greatBuilding.opened', ({ owner, own }) => {
      if (!own) view(owner);
    });
    ctx.bus.on('city.visited', ({ owner }) => view(owner));
  },
};
