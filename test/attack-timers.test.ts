import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { BattleStore } from '../src/content/stores/battles';
import { CatalogStore } from '../src/content/stores/catalog';
import { CityStore } from '../src/content/stores/cities';
import { IncomingStore } from '../src/content/stores/incoming';
import { PlayerStore } from '../src/content/stores/players';
import { PlunderStore } from '../src/content/stores/plunders';
import { ResourceStore } from '../src/content/stores/resources';
import { SessionStore } from '../src/content/stores/session';
import { ShieldStore } from '../src/content/stores/shields';
import { playerId, worldId } from '../src/shared/ids';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');
const NOW = 1_792_000_000_000;
const DAY = 86_400_000;

function setup() {
  const bus = createBus();
  const ingestion = new Ingestion();
  const db = testDb();
  const players = new PlayerStore(bus, db.players);
  registerGameHandlers(ingestion, {
    world,
    bus,
    now: () => NOW,
    session: new SessionStore(bus),
    players,
    cities: new CityStore(bus),
    catalog: new CatalogStore(bus),
    resources: new ResourceStore(bus),
    battles: new BattleStore(bus, world, db.persistence),
    plunders: new PlunderStore(bus, world, db.plunders),
    incoming: new IncomingStore(bus, world, db.incoming),
    shields: new ShieldStore(bus, world, db.shields),
  });
  const send = (requestClass: string, requestMethod: string, responseData: unknown) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: null,
      response: JSON.stringify([{ requestClass, requestMethod, responseData }]),
      at: 0,
    });
  const update = (player: object) => send('OtherPlayerService', 'updatePlayer', [player]);
  return { db, players, send, update };
}

const attackOf = (store: PlayerStore, id: number) => store.get(playerId(id))?.attack;

describe('attack timers of players', () => {
  it('takes plunderable and the deadline from an updatePlayer after a won battle', () => {
    const { players, update } = setup();
    update({ player_id: 1, name: 'A', next_interaction_in: 86400, canSabotage: true });
    expect(attackOf(players, 1)).toEqual({ canPlunder: true, nextInteractionAt: NOW + DAY });
  });

  it('clears plunderable when the updatePlayer after the plunder lacks canSabotage', () => {
    const { players, update } = setup();
    update({ player_id: 1, next_interaction_in: 86400, canSabotage: true });
    update({ player_id: 1, next_interaction_in: 86345 });
    expect(attackOf(players, 1)).toEqual({ canPlunder: false, nextInteractionAt: NOW + 86_345_000 });
  });

  it('takes the timers of the neighbours from the social list, also clearing them', () => {
    const { players, send, update } = setup();
    update({ player_id: 2, next_interaction_in: 100, canSabotage: true });
    send('OtherPlayerService', 'getSocialList', {
      neighbours: [{ player_id: 1, next_interaction_in: 3600, canSabotage: true }, { player_id: 2 }],
      friends: [],
      guildMembers: [],
    });
    expect(attackOf(players, 1)).toEqual({ canPlunder: true, nextInteractionAt: NOW + 3_600_000 });
    expect(attackOf(players, 2)).toEqual({ canPlunder: false });
  });

  it('keeps the timers on a visit and on friend or guild entries of the social list, which carry none', () => {
    const { players, send, update } = setup();
    update({ player_id: 1, next_interaction_in: 3600, canSabotage: true });
    send('OtherPlayerService', 'visitPlayer', { other_player: { player_id: 1, name: 'Visited' }, city_map: {} });
    send('OtherPlayerService', 'getSocialList', { neighbours: [], friends: [{ player_id: 1 }], guildMembers: [] });
    expect(attackOf(players, 1)).toEqual({ canPlunder: true, nextInteractionAt: NOW + 3_600_000 });
  });

  it('keeps the timers over a reload', async () => {
    const { db, update } = setup();
    update({ player_id: 1, next_interaction_in: 86400, canSabotage: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const later = new PlayerStore(createBus(), db.players);
    await later.load(world);
    expect(attackOf(later, 1)).toEqual({ canPlunder: true, nextInteractionAt: NOW + DAY });
  });
});
