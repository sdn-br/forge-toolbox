// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { foestatsFeature } from '../src/content/features/foestats';
import { settingsFeature } from '../src/content/features/settings-feature';
import { FOESTATS_SETTING } from '../src/content/features/shared/settings';
import type { FetchLike } from '../src/content/stores/foestats-api';
import { eraId, playerId, worldId } from '../src/shared/ids';
import { featureContext } from './helpers/feature-context';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** a ScoreDB player page with two days of points and battles, made up */
const PAGE = `<html><head><title>Someone - DE20</title></head><body>
<div id="playerPoints" data-labels="Someone,Other" data-startdate="2026_10_22" data-counters="1300|1200,9000|8000"></div>
<div id="playerBattles" data-labels="Battles" data-startdate="2026_10_22" data-counters="12|10"></div>
</body></html>`;

/** the feature with foestats asked by default here, as these tests were written for it; ScoreDB through `pages` */
async function setup(source: 'foestats' | 'scoredb' | 'none' = 'foestats') {
  const fetch = vi.fn<FetchLike>(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, data: { points: 1, battles: 1, data_date: '2026-10-22' } }),
  }));
  const pages = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, text: async () => PAGE }));
  const env = featureContext({ fetch, pages });
  foestatsFeature.setup(env.ctx);
  settingsFeature.setup(env.ctx);
  await env.ctx.settings.of(FOESTATS_SETTING).set(source);
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
  return { ...env, fetch, pages, visit, asked };
}

describe('foestats feature', () => {
  it('asks about the player of a visited city', async () => {
    const { ctx, visit, asked } = await setup();
    visit(42);
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(42))?.loading).toBe(false));
    expect(asked()).toEqual(['42']);
  });

  it('asks about the owner of a foreign great building only', async () => {
    const { ctx, asked } = await setup();
    ctx.bus.emit('greatBuilding.opened', { owner: playerId(7), entityId: 1, own: true });
    ctx.bus.emit('greatBuilding.opened', { owner: playerId(8), entityId: 2, own: false });
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(8))?.loading).toBe(false));
    expect(asked()).toEqual(['8']);
  });

  it('asks about the owner of a great building list, unless it came quietly', async () => {
    const { ctx, asked } = await setup();
    const list = (owner: number, quiet: boolean) =>
      ctx.bus.emit('greatBuildings.listed', { owner: playerId(owner), entityIds: [], at: 0, quiet });
    list(9, true);
    list(10, false);
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(10))?.loading).toBe(false));
    expect(asked()).toEqual(['10']);
    expect(ctx.foestats.get(playerId(9))).toBeUndefined();
  });

  it('asks no other player while foestats was unreachable a short while ago', async () => {
    const { ctx, visit, fetch } = await setup();
    fetch.mockResolvedValue({ ok: false, status: 403, text: async () => '' });
    visit(42);
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(42))?.loading).toBe(false));
    visit(43);
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(43))?.loading).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ctx.foestats.get(playerId(43))?.unreachable).toBe(true);
  });

  it('asks nothing while no site is chosen', async () => {
    const { ctx, visit, fetch, pages } = await setup('none');
    visit(42);
    ctx.bus.emit('greatBuilding.opened', { owner: playerId(8), entityId: 2, own: false });
    await tick();
    await tick();
    expect(fetch).not.toHaveBeenCalled();
    expect(pages).not.toHaveBeenCalled();
    expect(ctx.foestats.get(playerId(42))).toBeUndefined();
  });

  it('asks ScoreDB through the service worker when it is chosen, and keeps its days', async () => {
    const { ctx, visit, fetch, pages } = await setup('scoredb');
    visit(42);
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(42))?.loading).toBe(false));
    expect(fetch).not.toHaveBeenCalled();
    expect(pages.mock.calls.map(([url, init]) => [url, init.credentials])).toEqual([
      ['https://foe.scoredb.io/DE20/Player/42', 'omit'],
    ]);
    expect(ctx.foestats.get(playerId(42))?.days.map((d) => [d.date, d.points, d.battles])).toEqual([
      ['2026-10-21', 1200, 10],
      ['2026-10-22', 1300, 12],
    ]);
  });

  it('holds back only the site that was unreachable, so the other one is asked at once', async () => {
    const { ctx, visit, fetch, pages } = await setup();
    fetch.mockResolvedValue({ ok: false, status: 401, text: async () => '' });
    visit(42);
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(42))?.loading).toBe(false));
    await ctx.settings.of(FOESTATS_SETTING).set('scoredb');
    visit(43);
    await vi.waitFor(() => expect(ctx.foestats.get(playerId(43))?.loading).toBe(false));
    expect(pages).toHaveBeenCalledTimes(1);
    expect(ctx.foestats.get(playerId(43))).toMatchObject({ unreachable: false, unknown: false });
  });

  it('reads a toggle stored by an older version: off is no request, on is the default', async () => {
    const off = featureContext({ storage: {} });
    await off.ctx.settings.replace({ 'foestats.fetch': false });
    foestatsFeature.setup(off.ctx);
    expect(off.ctx.settings.of(FOESTATS_SETTING).get()).toBe('none');
    const on = featureContext();
    await on.ctx.settings.replace({ 'foestats.fetch': true });
    foestatsFeature.setup(on.ctx);
    expect(on.ctx.settings.of(FOESTATS_SETTING).get()).toBe('scoredb');
  });

  it('offers the choice of the site with a hint on what is sent', async () => {
    const { boxes, ctx } = await setup();
    ctx.open('settings', 'foestats.group');
    const text = boxes.get('settings')?.text ?? '';
    expect(text).toContain('Aktivität');
    expect(text).toContain('Abfrage');
    for (const label of ['Keine Abfrage', 'foestats.com', 'scoredb.io']) expect(text).toContain(label);
    expect(text).toContain('Fragt die gewählte Seite (foestats.com oder scoredb.io) einmal am Tag');
  });
});
