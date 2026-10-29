// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { foestatsFeature } from '../src/content/features/foestats';
import { settingsFeature } from '../src/content/features/settings-feature';
import type { FetchLike } from '../src/shared/foestats-api';
import { eraId, playerId, worldId } from '../src/shared/ids';
import { featureContext } from './helpers/feature-context';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const fetch = vi.fn<FetchLike>(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, data: [{ date: '2026-10-22', value: 1 }] }),
  }));
  const env = featureContext({ fetch });
  foestatsFeature.setup(env.ctx);
  settingsFeature(env.profileCopy).setup(env.ctx);
  const visit = (owner: number) =>
    env.ctx.cities.setVisited({
      world: worldId('de20'),
      owner: playerId(owner),
      era: eraId('IronAge'),
      map: 'main',
      takenAt: 0,
      buildings: new Map(),
      visit: { neighbor: true, friend: false, guildMember: false },
    });
  const asked = () => [...new Set(fetch.mock.calls.map(([url]) => url.split('/')[7]))];
  return { ...env, fetch, visit, asked };
}

describe('foestats feature', () => {
  it('asks about the player of a visited city', async () => {
    const { ctx, visit, asked } = setup();
    visit(42);
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(42))?.loading).toBe(false));
    expect(asked()).toEqual(['42']);
  });

  it('asks about the owner of a foreign great building only', async () => {
    const { ctx, asked } = setup();
    ctx.bus.emit('greatBuilding.opened', { owner: playerId(7), entityId: 1, own: true });
    ctx.bus.emit('greatBuilding.opened', { owner: playerId(8), entityId: 2, own: false });
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(8))?.loading).toBe(false));
    expect(asked()).toEqual(['8']);
  });

  it('asks nothing while the setting is off', async () => {
    const { ctx, visit, fetch } = setup();
    await ctx.settings.set('foestats.fetch', false);
    visit(42);
    ctx.bus.emit('greatBuilding.opened', { owner: playerId(8), entityId: 2, own: false });
    await tick();
    await tick();
    expect(fetch).not.toHaveBeenCalled();
    expect(ctx.foestats.get(playerId(42))).toBeUndefined();
  });

  it('offers the setting with a hint on what is sent', () => {
    const { boxes, ctx } = setup();
    ctx.bus.emit('settings.open', { group: 'foestats.group' });
    const text = boxes.get('settings')?.text ?? '';
    expect(text).toContain('foestats-Daten abrufen');
    expect(text).toContain('Fragt foestats.com einmal am Tag');
  });
});
