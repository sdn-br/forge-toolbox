// All stores of one world, built in one place: a new store touches this file and nothing else in the wiring.
import { battlePersistence } from '../../persistence/battles/client';
import { foestatsPersistence } from '../../persistence/foestats/client';
import { greatBuildingPersistence } from '../../persistence/great-buildings/client';
import { incomingPersistence } from '../../persistence/incoming/client';
import { notePersistence } from '../../persistence/notes/client';
import { playerPersistence } from '../../persistence/players/client';
import { plunderPersistence } from '../../persistence/plunders/client';
import { shieldPersistence } from '../../persistence/shields/client';
import { type FetchLike, foestatsApi } from '../../shared/foestats-api';
import type { WorldId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { Call } from '../core/rpc';
import type { Settings } from '../core/settings';
import { BattleStore } from './battles';
import { CatalogStore } from './catalog';
import { CityStore } from './cities';
import { FoestatsStore } from './foestats';
import { createGbOwnState, type GbOwnState } from './gb-own-state';
import { GreatBuildingStore } from './great-buildings';
import { IncomingStore } from './incoming';
import { InventoryStore } from './inventory';
import { NoteStore } from './notes';
import type { PrefStore } from './place-factors';
import { PlayerBonusStore } from './player-bonuses';
import { PlayerStore } from './players';
import { PlunderStore } from './plunders';
import { ResearchStore } from './research';
import { ResourceStore } from './resources';
import { SessionStore } from './session';
import { ShieldStore } from './shields';

export interface Stores {
  session: SessionStore;
  players: PlayerStore;
  cities: CityStore;
  catalog: CatalogStore;
  resources: ResourceStore;
  inventory: InventoryStore;
  research: ResearchStore;
  battles: BattleStore;
  plunders: PlunderStore;
  incoming: IncomingStore;
  shields: ShieldStore;
  notes: NoteStore;
  greatBuildings: GreatBuildingStore;
  playerBonuses: PlayerBonusStore;
  foestats: FoestatsStore;
  /** the factors and Ext the two own-share boxes share */
  gbOwn: GbOwnState;
}

/**
 * `call` reaches the persistence in the service worker; `view` holds the view choices and settings the shared state of
 * the own-share boxes rests on; `now` is the clock of the stores that keep times; `fetch` makes the requests to
 * foestats from the content script.
 */
export function createStores(
  world: WorldId,
  bus: ToolboxBus,
  call: Call,
  view: { prefs: PrefStore; settings: Settings },
  now: () => number = Date.now,
  fetch: FetchLike = (url, init) => globalThis.fetch(url, init),
): Stores {
  const cities = new CityStore(bus);
  return {
    session: new SessionStore(bus),
    players: new PlayerStore(bus, playerPersistence(call), now),
    cities,
    catalog: new CatalogStore(bus),
    resources: new ResourceStore(bus),
    inventory: new InventoryStore(bus),
    research: new ResearchStore(bus),
    battles: new BattleStore(bus, world, battlePersistence(call)),
    plunders: new PlunderStore(bus, world, plunderPersistence(call)),
    incoming: new IncomingStore(bus, world, incomingPersistence(call)),
    shields: new ShieldStore(bus, world, shieldPersistence(call), now),
    notes: new NoteStore(bus, world, notePersistence(call), now),
    greatBuildings: new GreatBuildingStore(bus, world, greatBuildingPersistence(call), now),
    playerBonuses: new PlayerBonusStore(cities),
    foestats: new FoestatsStore(bus, world, foestatsPersistence(call), foestatsApi(fetch)),
    gbOwn: createGbOwnState(bus, view.prefs, view.settings),
  };
}
