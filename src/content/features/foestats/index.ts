import type { PlayerId } from '../../../shared/ids';
import type { Feature } from '../../core/feature';
import { FOESTATS_SETTING } from '../shared/settings';

/**
 * Asks the chosen site (foestats or ScoreDB) about the players the viewer looks at: the owner of a foreign great building opened in the game and
 * the player of a visited city and the owner of a great building list. Nothing in the background, no neighbours or guild members ahead of time.
 */
export const foestatsFeature: Feature = {
  id: 'foestats',
  setup(ctx) {
    ctx.settings.registerGroup('foestats.group', '📈');
    const source = ctx.settings.register(FOESTATS_SETTING);
    /** the player each view shows last: the owner of an opened great building, of a visited city, of a listing */
    const shown = new Map<'greatBuilding' | 'city' | 'list', PlayerId>();
    const view = (player: PlayerId) => {
      const site = source.get();
      if (site !== 'none') void ctx.foestats.view(player, site);
    };
    const show = (at: 'greatBuilding' | 'city' | 'list', player: PlayerId) => {
      shown.set(at, player);
      view(player);
    };
    ctx.bus.on('greatBuilding.opened', ({ owner, own }) => {
      if (own) shown.delete('greatBuilding');
      else show('greatBuilding', owner);
    });
    ctx.bus.on('city.visited', ({ owner }) => show('city', owner));
    // a quiet list comes while a great building window shows, whose owner was asked about at its opening
    ctx.bus.on('greatBuildings.listed', ({ owner, quiet }) => {
      if (!quiet) show('list', owner);
    });
    // the shown players are viewed again with the new site; the claim asks only when their data is not of today
    source.onChange(() => {
      for (const player of new Set(shown.values())) view(player);
    });
  },
};
