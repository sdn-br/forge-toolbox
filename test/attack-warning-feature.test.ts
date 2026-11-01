// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { attackWarningFeature } from '../src/content/features/attack-warning';
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

function setup() {
  const { ctx } = featureContext();
  attackWarningFeature.setup(ctx);
  ctx.players.apply(worldId('de20'), [seen(111, 'Redcowboy'), seen(222, 'Friend')], 'visit');
  ctx.players.setNoAttack(playerId(111), true);
  const cover = () =>
    document.querySelector('[data-forge-toolbox="attack-warning"]')?.shadowRoot?.querySelector('.cover') ?? null;
  return { ctx, cover };
}

afterEach(() => {
  for (const el of document.querySelectorAll('[data-forge-toolbox="attack-warning"]')) el.remove();
});

describe('attack warning', () => {
  it('covers the buttons of the army window against a player marked not to attack, naming the player', () => {
    const { ctx, cover } = setup();
    ctx.bus.emit('army.target', { opponent: playerId(111) });
    expect(cover()?.textContent).toContain('Redcowboy steht auf „nicht angreifen“.');
  });

  it('shows nothing against another player', () => {
    const { ctx, cover } = setup();
    ctx.bus.emit('army.target', { opponent: playerId(222) });
    expect(cover()).toBeNull();
    ctx.bus.emit('army.target', { opponent: playerId(999) });
    expect(cover()).toBeNull();
  });

  it('goes with "fight anyway"', () => {
    const { ctx, cover } = setup();
    ctx.bus.emit('army.target', { opponent: playerId(111) });
    (cover() as Element).querySelector('button')?.click();
    expect(cover()).toBeNull();
  });

  it.each([
    ['the window closes', 'army.closed'],
    ['a battle starts', 'battle.started'],
  ] as const)('goes when %s', (_name, event) => {
    const { ctx, cover } = setup();
    ctx.bus.emit('army.target', { opponent: playerId(111) });
    ctx.bus.emit(event, {});
    expect(cover()).toBeNull();
  });

  it('goes when another army window opens and comes back for the next marked opponent', () => {
    const { ctx, cover } = setup();
    ctx.bus.emit('army.target', { opponent: playerId(111) });
    ctx.bus.emit('army.opened', { battleType: 'pvp' });
    expect(cover()).toBeNull();
    ctx.bus.emit('army.target', { opponent: playerId(111) });
    expect(cover()).not.toBeNull();
  });
});
