import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../src/content/stores/foestats-api';
import { scoredbDays } from '../src/persistence/scoredb/page';
import { scoredbPlayer } from '../src/persistence/scoredb/worker';
import { playerId, worldId } from '../src/shared/ids';
import type { FoestatsDay } from '../src/shared/model';
import { testDb } from './helpers/battle-db';

const world = worldId('de10');
const player = playerId(4711);

/** a made-up ScoreDB player page with the two charts as the real one carries them, among other markup */
const page = (points: string | undefined, battles: string | undefined, start = '2026_11_12') => `<!DOCTYPE html>
<html><head><title>Testspieler - DE10</title></head><body>
<a href="/DE10/Guild/507"><img class="small-avatar mr-2" src="x.png" />Testgilde</a>
<p class="list-group-item"><i class="fa fa-home"></i>1,300 points</p>
${points === undefined ? '' : `<div id="playerPoints" class="morris-counter-chart" data-chart="line" data-labels="Testspieler,Nachbar A" data-colors="#2244ff,#ffbb00" data-startdate="${start}" data-counters="${points}"></div>`}
<script>var x = "<div>";</script>
${battles === undefined ? '' : `<div data-counters='${battles}' data-startdate='${start}' class="morris-counter-chart" id='playerBattles' data-labels="Battles"></div>`}
</body></html>`;

const values = (days: FoestatsDay[] | undefined) => days?.map((d) => [d.date, d.points, d.battles]);

describe('scoredbDays', () => {
  it('pairs the player series of both charts by day, newest first in the page, oldest first out', () => {
    const html = page('1300|1200|1100,99999|88888|77777', '12|10|9');
    expect(values(scoredbDays(html, world, player))).toEqual([
      ['2026-11-10', 1100, 9],
      ['2026-11-11', 1200, 10],
      ['2026-11-12', 1300, 12],
    ]);
    expect(scoredbDays(html, world, player)?.[0]).toEqual({
      world,
      player,
      date: '2026-11-10',
      points: 1100,
      battles: 9,
    });
  });

  it('counts the days back across a month', () => {
    expect(values(scoredbDays(page('3|2|1', '3|2|1', '2026_03_01'), world, player))?.map(([d]) => d)).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('leaves out a day that is in one chart only or holds no number', () => {
    const html = page('1300|x||1000|900', '12|11|10|');
    expect(values(scoredbDays(html, world, player))).toEqual([['2026-11-12', 1300, 12]]);
  });

  it('tells nothing for a page without both charts, without a start day or with an odd one', () => {
    expect(scoredbDays(page('1300|1200', undefined), world, player)).toBeUndefined();
    expect(scoredbDays(page(undefined, '12|10'), world, player)).toBeUndefined();
    expect(scoredbDays(page('1300', '12', 'yesterday'), world, player)).toBeUndefined();
    expect(scoredbDays(page('1300', '12', '2026_02_30'), world, player)).toBeUndefined();
    expect(scoredbDays(page('', ''), world, player)).toBeUndefined();
    expect(scoredbDays('<html><title>Error</title></html>', world, player)).toBeUndefined();
  });
});

describe('scoredbPlayer', () => {
  const answer = (status: number, body: string) =>
    vi.fn<FetchLike>(async () => ({ ok: status >= 200 && status < 300, status, text: async () => body }));

  it('reads the page of the player without cookies', async () => {
    const fetch = answer(200, page('1300|1200', '12|10'));
    const outcome = await scoredbPlayer(fetch, world, player);
    expect(fetch).toHaveBeenCalledWith(
      'https://foe.scoredb.io/DE10/Player/4711',
      expect.objectContaining({ credentials: 'omit' }),
    );
    expect(outcome).toEqual({
      days: [
        { world, player, date: '2026-11-11', points: 1200, battles: 10 },
        { world, player, date: '2026-11-12', points: 1300, battles: 12 },
      ],
    });
  });

  it('counts an error page, a missing page and a page without charts as a player ScoreDB does not know', async () => {
    expect(await scoredbPlayer(answer(500, '<html><head><title>Error</title></head></html>'), world, player)).toBe(
      'unknown',
    );
    expect(await scoredbPlayer(answer(404, ''), world, player)).toBe('unknown');
    expect(await scoredbPlayer(answer(200, page(undefined, '12')), world, player)).toBe('unknown');
  });

  it('counts a network error and any other failing status as unreachable', async () => {
    const broken = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await scoredbPlayer(broken, world, player)).toBe('unreachable');
    expect(await scoredbPlayer(answer(500, 'upstream down'), world, player)).toBe('unreachable');
    expect(await scoredbPlayer(answer(503, ''), world, player)).toBe('unreachable');
    expect(await scoredbPlayer(answer(403, ''), world, player)).toBe('unreachable');
  });
});

describe('storing what ScoreDB reports', () => {
  const day = (date: string, points: number, battles: number, active?: boolean): FoestatsDay => ({
    world,
    player,
    date,
    points,
    battles,
    ...(active !== undefined && { active }),
  });

  it('puts every reported day, over what was stored for it, and keeps the others', async () => {
    const { db, foestats } = testDb();
    await db.foestatsDays.bulkPut([day('2026-11-09', 900, 8), day('2026-11-11', 1, 1, true)]);
    expect(await foestats.claim(world, player, 'scoredb')).toMatchObject({ fetch: true });
    const state = await foestats.store(
      world,
      player,
      { days: [day('2026-11-11', 1200, 10), day('2026-11-12', 1300, 12)] },
      'scoredb',
    );
    expect(state).toEqual({ unreachable: false, unknown: false });
    expect(values(await foestats.history(world, player))).toEqual([
      ['2026-11-09', 900, 8],
      ['2026-11-11', 1200, 10],
      ['2026-11-12', 1300, 12],
    ]);
    expect(await foestats.claim(world, player, 'scoredb')).toMatchObject({ fetch: false });
  });

  it('asks the page through the service worker', async () => {
    const fetchPage = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, text: async () => page('5', '6') }));
    const { call } = testDb({ fetchPage });
    expect(await call('scoredb.player', { world, player })).toEqual({ days: [day('2026-11-12', 5, 6)] });
  });
});
