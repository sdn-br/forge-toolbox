// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { contributionWarningFeature } from '../src/content/features/contribution-warning';
import type { PlayerObservation } from '../src/content/stores/players';
import { eraId, playerId, worldId } from '../src/shared/ids';
import { featureContext } from './helpers/feature-context';

const seen = (id: number, name: string): PlayerObservation => ({
  id: playerId(id),
  name,
  avatar: '',
  cityName: '',
  era: eraId('ColonialAge'),
  score: 0,
  rank: 0,
  active: true,
  guild: null,
});

const owner = playerId(111);
const friend = playerId(222);

function setup() {
  const { ctx } = featureContext();
  contributionWarningFeature.setup(ctx);
  ctx.players.apply(worldId('de20'), [seen(111, 'Redcowboy'), seen(222, 'Friend')], 'visit');
  /** the ids of the buildings the test ignores */
  const ignoredBuildings = new Set<number>();
  ctx.greatBuildings.isIgnored = (_owner, entityId) => ignoredBuildings.has(entityId);
  const cover = () =>
    document.querySelector('[data-forge-toolbox="contribution-warning"]')?.shadowRoot?.querySelector('.cover') ?? null;
  const open = (who = owner, entityId = 1, own = false) =>
    ctx.bus.emit('greatBuilding.opened', { owner: who, entityId, own });
  return { ctx, cover, open, ignoredBuildings };
}

afterEach(() => {
  for (const el of document.querySelectorAll('[data-forge-toolbox="contribution-warning"]')) el.remove();
});

describe('contribution warning', () => {
  it('covers the contribution buttons of a building of an ignored player, naming the player', () => {
    const { ctx, cover, open } = setup();
    ctx.players.setIgnored(owner, true);
    open();
    expect(cover()?.textContent).toContain('Spieler Redcowboy steht auf Ignorieren.');
  });

  it('covers the contribution buttons of an ignored building', () => {
    const { cover, open, ignoredBuildings } = setup();
    ignoredBuildings.add(1);
    open(friend);
    expect(cover()?.textContent).toContain('Dieses LG steht auf Ignorieren.');
  });

  it('names the player when both are ignored', () => {
    const { ctx, cover, open, ignoredBuildings } = setup();
    ctx.players.setIgnored(owner, true);
    ignoredBuildings.add(1);
    open();
    expect(cover()?.textContent).toContain('Spieler Redcowboy');
  });

  it('shows nothing for an own building, even when its owner is ignored', () => {
    const { ctx, cover, open, ignoredBuildings } = setup();
    ctx.players.setIgnored(owner, true);
    ignoredBuildings.add(1);
    open(owner, 1, true);
    expect(cover()).toBeNull();
  });

  it('shows nothing when neither is ignored', () => {
    const { cover, open } = setup();
    open();
    expect(cover()).toBeNull();
  });

  it.each(['list', 'none', 'own'] as const)('goes when the game window turns to %s', (state) => {
    const { ctx, cover, open, ignoredBuildings } = setup();
    ignoredBuildings.add(1);
    open();
    ctx.bus.emit('gbWindow.changed', { state });
    expect(cover()).toBeNull();
  });

  it('stays when the engine says the window is foreign', () => {
    const { ctx, cover, open, ignoredBuildings } = setup();
    ignoredBuildings.add(1);
    open();
    ctx.bus.emit('gbWindow.changed', { state: 'foreign' });
    expect(cover()).not.toBeNull();
  });

  it('goes with "pay in anyway" and stays away for that building, but not for the next one', () => {
    const { ctx, cover, open, ignoredBuildings } = setup();
    ignoredBuildings.add(1);
    ignoredBuildings.add(2);
    open();
    (cover() as Element).querySelector('button')?.click();
    expect(cover()).toBeNull();
    ctx.bus.emit('greatBuilding.changed', { owner, entityId: 1, reason: 'ranking' });
    ctx.bus.emit('greatBuilding.ignored', { owner, entityId: 1, ignored: true });
    expect(cover()).toBeNull();
    open(owner, 2);
    expect(cover()).not.toBeNull();
  });

  it('goes when another building opens that is not ignored', () => {
    const { cover, open, ignoredBuildings } = setup();
    ignoredBuildings.add(1);
    open();
    open(friend, 2);
    expect(cover()).toBeNull();
  });

  it('follows an ignore of the open building and of its owner', () => {
    const { ctx, cover, open, ignoredBuildings } = setup();
    open();
    expect(cover()).toBeNull();
    ignoredBuildings.add(1);
    ctx.bus.emit('greatBuilding.ignored', { owner, entityId: 1, ignored: true });
    expect(cover()).not.toBeNull();
    ignoredBuildings.delete(1);
    ctx.bus.emit('greatBuilding.ignored', { owner, entityId: 1, ignored: false });
    expect(cover()).toBeNull();
    ctx.players.setIgnored(owner, true);
    ctx.bus.emit('player.updated', { ids: [owner], source: 'ignore' });
    expect(cover()?.textContent).toContain('Redcowboy');
    ctx.players.setIgnored(owner, false);
    ctx.bus.emit('player.updated', { ids: [owner], source: 'ignore' });
    expect(cover()).toBeNull();
  });

  it('ignores the ignore of another building', () => {
    const { ctx, cover, open, ignoredBuildings } = setup();
    open();
    ignoredBuildings.add(2);
    ctx.bus.emit('greatBuilding.ignored', { owner, entityId: 2, ignored: true });
    expect(cover()).toBeNull();
  });
});
