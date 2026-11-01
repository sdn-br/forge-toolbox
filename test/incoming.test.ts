import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { IncomingStore } from '../src/content/stores/incoming';
import { buildingDefId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { IncomingAttack } from '../src/shared/model';
import fixture from './fixtures/pvp-events.json';
import { testStores } from './helpers/stores';

const world = worldId('de20');
const attacker = playerId(1003);
// the recordings were made on this Tuesday; the battle event says "Samstag um 20:25"
const NOW = new Date(2026, 9, 20, 16, 31).getTime();
const SATURDAY = new Date(2026, 9, 17, 20, 25).getTime();

function setup(me: number | null = fixture.me) {
  const ingestion = new Ingestion();
  let now = NOW;
  const { db, bus, stores } = testStores({ now: () => now });
  registerGameHandlers(ingestion, { world, bus, now: () => now, ...stores });
  const { incoming } = stores;
  const recorded: PlayerId[] = [];
  bus.on('incoming.recorded', (e) => recorded.push(e.attacker));
  const page = (entries: unknown[]) =>
    ingestion.accept({ kind: 'json', url: '/game/json?h=1', request: null, response: JSON.stringify(entries), at: 0 });
  const live = (entries: unknown[]) => ingestion.accept({ kind: 'ws', data: JSON.stringify(entries), at: 0 });
  if (me !== null)
    page([
      { requestClass: 'StartupService', requestMethod: 'getData', responseData: { user_data: { player_id: me } } },
    ]);
  return { db, incoming, recorded, page, live, setNow: (at: number) => (now = at) };
}

const battleEvent = () => {
  const event = fixture.page[0]?.responseData.events.find((e) => e.type === 'battle');
  if (!event) throw new Error('fixture has no battle');
  return structuredClone(event);
};

/** the fixture page with only the battle event, changed */
const pageWith = (change: Record<string, unknown>) => [
  {
    requestClass: 'OtherPlayerService',
    requestMethod: 'getEventsPaginated',
    responseData: { page: 1, events: [{ ...battleEvent(), ...change }] },
  },
];

const newEvent = (event: unknown) => [
  { requestClass: 'OtherPlayerService', requestMethod: 'newEvent', responseData: event },
];

// Assumed, not yet seen: a plunder of an own building comes like the polish of the live fixture.
const plunderEvent = () => ({
  ...structuredClone(fixture.live[0]?.responseData),
  interaction_type: 'plunder',
  entity_id: 'R_VirtualFuture_Residential4',
});

const attack = (key: number, at: number, by = 1003, change: Partial<IncomingAttack> = {}): IncomingAttack => ({
  world,
  kind: 'battle',
  key,
  at,
  attacker: playerId(by),
  defense: 'broken',
  ...change,
});

describe('recording attacks on the own city', () => {
  it('records a battle from the event history with the time its text names, and nothing else of the page', async () => {
    const { incoming, recorded, page } = setup();
    page(fixture.page);
    expect(await incoming.list({ limit: 10, offset: 0 })).toEqual([
      { world, kind: 'battle', key: 5003, at: SATURDAY, attacker, defense: 'broken' },
    ]);
    expect(recorded).toEqual([attacker]);
  });

  it('ignores a live polish and other social interactions', async () => {
    const { incoming, recorded, live } = setup();
    live(fixture.live);
    expect(await incoming.totals()).toEqual({ battles: 0, held: 0, plunders: 0 });
    expect(recorded).toEqual([]);
  });

  it('records a live plunder at the time it arrives (assumed event shape)', async () => {
    const { incoming, recorded, live } = setup();
    live(newEvent(plunderEvent()));
    expect(await incoming.latest(playerId(1004))).toEqual({
      world,
      kind: 'plunder',
      key: 9004,
      at: NOW,
      attacker: 1004,
      cityEntityId: 'R_VirtualFuture_Residential4',
    });
    expect(recorded).toEqual([1004]);
  });

  it('counts a won battle as a held defense (assumed status)', async () => {
    const { incoming, page } = setup();
    page(pageWith({ status: 'won' }));
    expect((await incoming.latest(attacker))?.defense).toBe('held');
  });

  it('stores a battle seen live and later in the history once, with the live time', async () => {
    const { db, incoming, recorded, page, live, setNow } = setup();
    setNow(SATURDAY + 30_000);
    live(newEvent({ ...battleEvent(), date: 'heute um 20:25 Uhr' }));
    setNow(NOW);
    page(fixture.page);
    expect(await incoming.list({ limit: 10, offset: 0 })).toEqual([attack(5003, SATURDAY + 30_000)]);
    expect(recorded).toHaveLength(1);
    // a later session reads the history again
    const later = new IncomingStore(createBus(), world, db.incoming);
    later.record(attack(5003, SATURDAY));
    expect(await later.list({ limit: 10, offset: 0 })).toEqual([attack(5003, SATURDAY + 30_000)]);
  });

  it('ignores unknown statuses and types, unreadable dates, other players and its own name', async () => {
    const { incoming, recorded, page, live } = setup();
    page(pageWith({ status: 'draw' }));
    page(pageWith({ type: 'battle_report' }));
    page(pageWith({ date: 'vor 5 Minuten' }));
    page(pageWith({ player_id: 1002 }));
    page(pageWith({ other_player: { player_id: fixture.me } }));
    live(newEvent({ ...plunderEvent(), id: undefined }));
    live(newEvent(null));
    expect(await incoming.totals()).toEqual({ battles: 0, held: 0, plunders: 0 });
    expect(recorded).toEqual([]);
  });

  it('takes an event without player id as the session player', async () => {
    const { incoming, page } = setup();
    page(pageWith({ player_id: undefined }));
    expect((await incoming.totals()).battles).toBe(1);
  });

  it('needs a session', async () => {
    const { incoming, page } = setup(null);
    page(fixture.page);
    expect((await incoming.totals()).battles).toBe(0);
  });
});

describe('queries of attacks on the own city', () => {
  async function filled() {
    const { incoming, db } = setup(null);
    for (const a of [
      attack(1, 100),
      attack(2, 300, 1002, { defense: 'held' }),
      attack(9, 200, 1003, { kind: 'plunder', defense: undefined, cityEntityId: buildingDefId('R_X') }),
      attack(3, 250, 1003, { defense: 'held' }),
    ]) {
      incoming.record(a);
    }
    // an attack in another world goes in directly, the store only records its own world
    await db.db.incoming.put(attack(4, 400, 1003, { world: worldId('en1') }));
    return { incoming, db: db.db };
  }

  it('lists newest first with paging and an attacker filter', async () => {
    const { incoming } = await filled();
    const keys = async (q: Parameters<IncomingStore['list']>[0]) => (await incoming.list(q)).map((a) => a.key);
    expect(await keys({ limit: 10, offset: 0 })).toEqual([2, 3, 9, 1]);
    expect(await keys({ limit: 2, offset: 2 })).toEqual([9, 1]);
    expect(await keys({ opponents: [attacker], limit: 10, offset: 0 })).toEqual([3, 9, 1]);
    expect(await keys({ opponents: [], limit: 10, offset: 0 })).toEqual([]);
  });

  it('counts battles, held ones and plunders', async () => {
    const { incoming } = await filled();
    expect(await incoming.totals()).toEqual({ battles: 3, held: 2, plunders: 1 });
    expect(await incoming.totals([attacker])).toEqual({ battles: 2, held: 1, plunders: 1 });
  });

  it('finds the latest attack of a player', async () => {
    const { incoming } = await filled();
    expect((await incoming.latest(attacker))?.key).toBe(3);
    expect(await incoming.latest(playerId(9999))).toBeUndefined();
  });

  it('keeps a battle and a plunder with the same number apart', async () => {
    const { incoming } = await filled();
    incoming.record(attack(1, 500, 1003, { kind: 'plunder', defense: undefined }));
    expect((await incoming.totals()).plunders).toBe(2);
  });

  it('prunes attacks older than the limit in every world', async () => {
    const { incoming, db } = await filled();
    expect(await incoming.prune(260)).toBe(3);
    expect((await db.incoming.toArray()).map((a) => a.key).sort()).toEqual([2, 4]);
  });
});
