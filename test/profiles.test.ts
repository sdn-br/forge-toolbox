import { describe, expect, it, vi } from 'vitest';
import { openDb, type ToolboxDb } from '../src/background/db';
import { isRpcRequest, profileDispatch } from '../src/background/profiles';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle } from '../src/shared/model';
import { type Profile, profileDbName, profileOfDbName } from '../src/shared/profile';
import type { RpcRequest } from '../src/shared/rpc';

let worldCount = 0;
const battle = (world: string, battleId: number): Battle => ({
  world: worldId(world),
  battleId,
  at: 1,
  opponent: playerId(11),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
});

function setup(prepare: (profile: Profile, db: ToolboxDb) => Promise<void> = async () => {}) {
  const world = worldId(`p${++worldCount}`);
  const opened: string[] = [];
  const watched: string[] = [];
  const dispatch = profileDispatch({
    open: (name) => {
      opened.push(name);
      return openDb(name);
    },
    prepare,
    watch: (profile, db) => watched.push(`${profile.player} ${db.name}`),
    deps: { now: () => 1000 },
    logError: vi.fn(),
  });
  const a: Profile = { world, player: playerId(1) };
  const b: Profile = { world, player: playerId(2) };
  return { world, a, b, dispatch, opened, watched };
}

const req = <M extends RpcRequest['rpc']>(profile: Profile, rpc: M, arg: RpcRequest<M>['arg']) =>
  ({ profile, rpc, arg }) as RpcRequest;

describe('profile dispatch', () => {
  it('gives each profile its own database, so one never sees the rows of another', async () => {
    const { world, a, b, dispatch, opened } = setup();
    await dispatch(req(a, 'battles.put', { rows: [battle(world, 1)] }));
    await dispatch(req(b, 'battles.put', { rows: [battle(world, 2)] }));

    const listOf = async (p: Profile) =>
      dispatch(req(p, 'battles.list', { world, limit: 10, offset: 0 })).then((res) =>
        res.ok ? (res.result as Battle[]).map((x) => x.battleId) : res.error,
      );
    expect(await listOf(a)).toEqual([1]);
    expect(await listOf(b)).toEqual([2]);
    expect(opened).toEqual([profileDbName(a), profileDbName(b)]);
  });

  it('opens and prepares a database once, before its first handler runs', async () => {
    const order: string[] = [];
    const { world, a, dispatch, opened } = setup(async (profile, db) => {
      order.push(`prepare ${profile.player}`);
      await db.battles.put(battle(profile.world, 9));
    });
    await Promise.all([
      dispatch(req(a, 'battles.count', { world })),
      dispatch(req(a, 'battles.count', { world })),
    ]).then((all) => order.push(...all.map((res) => (res.ok ? `count ${res.result}` : res.error))));
    expect(order).toEqual(['prepare 1', 'count 1', 'count 1']);
    expect(opened).toEqual([profileDbName(a)]);
  });

  it('watches the database once, after the preparation, so the takeover of old rows is no change', async () => {
    const order: string[] = [];
    const { world, a, dispatch, watched } = setup(async () => {
      order.push(`prepare, watched ${watched.length}`);
    });
    await dispatch(req(a, 'battles.count', { world }));
    await dispatch(req(a, 'battles.count', { world }));
    expect(order).toEqual(['prepare, watched 0']);
    expect(watched).toEqual([`1 ${profileDbName(a)}`]);
  });

  it('runs one preparation at a time', async () => {
    let running = 0;
    let most = 0;
    const { world, a, b, dispatch } = setup(async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });
    await Promise.all([dispatch(req(a, 'battles.count', { world })), dispatch(req(b, 'battles.count', { world }))]);
    expect(most).toBe(1);
  });

  it('still serves the profile when the preparation fails', async () => {
    const { world, a, dispatch } = setup(async () => {
      throw new Error('broken');
    });
    expect(await dispatch(req(a, 'battles.count', { world }))).toEqual({ ok: true, result: 0 });
  });

  it('answers an unknown call with an error', async () => {
    const { a, dispatch } = setup();
    expect(await dispatch({ profile: a, rpc: 'nope', arg: {} } as never)).toEqual({
      ok: false,
      error: 'unknown call nope',
    });
  });
});

describe('isRpcRequest', () => {
  it('takes only calls that name a valid profile', () => {
    const profile = { world: 'de20', player: 1 };
    expect(isRpcRequest({ profile, rpc: 'battles.count', arg: {} })).toBe(true);
    expect(isRpcRequest({ rpc: 'battles.count', arg: {} })).toBe(false);
    expect(isRpcRequest({ profile: { world: 'de:20', player: 1 }, rpc: 'x' })).toBe(false);
    expect(isRpcRequest({ profile: { world: 'de20', player: '1' }, rpc: 'x' })).toBe(false);
    expect(isRpcRequest('forge-toolbox.openDataPage')).toBe(false);
  });
});

describe('profile database name', () => {
  it('reads back the profile, and nothing from other names', () => {
    const profile = { world: worldId('de20'), player: playerId(12345) };
    expect(profileDbName(profile)).toBe('forge-toolbox:de20:12345');
    expect(profileOfDbName('forge-toolbox:de20:12345')).toEqual(profile);
    expect(profileOfDbName('forge-toolbox')).toBeNull();
    expect(profileOfDbName('forge-toolbox:de20')).toBeNull();
    expect(profileOfDbName('other:de20:1')).toBeNull();
  });
});
