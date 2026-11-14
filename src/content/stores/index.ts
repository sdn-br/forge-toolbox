// All stores of one world, built in one place: a new store touches this file and nothing else in the wiring.
import { assetPersistence } from '../../persistence/assets/client';
import { foestatsPersistence } from '../../persistence/foestats/client';
import { greatBuildingPersistence } from '../../persistence/great-buildings/client';
import { incomingPersistence } from '../../persistence/incoming/client';
import { notePersistence } from '../../persistence/notes/client';
import { playerPersistence } from '../../persistence/players/client';
import { battlePersistence } from '../../persistence/pvp/battles-client';
import { plunderPersistence } from '../../persistence/pvp/plunders-client';
import { scoredbRequests } from '../../persistence/scoredb/client';
import { shieldPersistence } from '../../persistence/shields/client';
import type { BuildingDefId, WorldId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { Call } from '../core/rpc';
import shippedLevelCosts from '../data/gb-level-costs.json';
import type { FactorChoice } from '../domain/gb-factor';
import { type LevelCostFile, type LevelCosts, levelCosts } from '../domain/gb-level-cost';
import type { GreatBuildingDef } from '../model/catalog';
import { AssetStore } from './assets';
import { BattleStore } from './battles';
import { type BuildingDefLoader, CatalogStore } from './catalog';
import { CityStore } from './cities';
import { FoestatsStore } from './foestats';
import { type FetchLike, foestatsApi } from './foestats-api';
import type { PrefStore } from './gb-own-state';
import { GbOwnState } from './gb-own-state';
import { GreatBuildingStore } from './great-buildings';
import { IncomingStore } from './incoming';
import { InventoryStore } from './inventory';
import { NoteStore } from './notes';
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
  /** game images on the Inno CDN */
  assets: AssetStore;
  resources: ResourceStore;
  inventory: InventoryStore;
  research: ResearchStore;
  battles: BattleStore;
  plunders: PlunderStore;
  incoming: IncomingStore;
  shields: ShieldStore;
  notes: NoteStore;
  greatBuildings: GreatBuildingStore;
  /** the cost of each level of a great building of a type, from its definition and the costs shipped with the toolbox */
  gbLevelCosts: (type: BuildingDefId, gb: GreatBuildingDef) => LevelCosts;
  playerBonuses: PlayerBonusStore;
  foestats: FoestatsStore;
  /** the factors and Ext the two own-share boxes share */
  gbOwn: GbOwnState;
}

/**
 * `call` reaches the persistence in the service worker; `defLoader` reads the cached building definitions (it translates
 * them, which the stores do not know how to); `view` holds the view choices and the single factor the shared state of
 * the own-share boxes rests on; `now` is the clock of the stores that keep times; `fetch` makes the requests to
 * foestats from the content script (ScoreDB goes through `call`). `shippedCosts` are the level costs shipped with the toolbox; tests pass their own, so
 * they see only the costs they bring.
 */
export function createStores(
  world: WorldId,
  bus: ToolboxBus,
  call: Call,
  defLoader: BuildingDefLoader,
  view: { prefs: PrefStore; singleFactor: () => FactorChoice },
  now: () => number = Date.now,
  fetch: FetchLike = (url, init) => globalThis.fetch(url, init),
  shippedCosts: LevelCostFile = shippedLevelCosts,
): Stores {
  const cities = new CityStore(bus);
  return {
    session: new SessionStore(bus),
    players: new PlayerStore(bus, playerPersistence(call), now),
    cities,
    catalog: new CatalogStore(bus, defLoader),
    assets: new AssetStore(bus, assetPersistence(call)),
    resources: new ResourceStore(bus),
    inventory: new InventoryStore(bus),
    research: new ResearchStore(bus),
    battles: new BattleStore(bus, world, battlePersistence(call)),
    plunders: new PlunderStore(bus, world, plunderPersistence(call)),
    incoming: new IncomingStore(bus, world, incomingPersistence(call)),
    shields: new ShieldStore(bus, world, shieldPersistence(call), now),
    notes: new NoteStore(bus, world, notePersistence(call), now),
    greatBuildings: new GreatBuildingStore(bus, world, greatBuildingPersistence(call), now),
    gbLevelCosts: (type, gb) => levelCosts(gb.levelCosts, shippedCosts[type]),
    playerBonuses: new PlayerBonusStore(cities),
    foestats: new FoestatsStore(bus, world, foestatsPersistence(call), {
      foestats: foestatsApi(fetch),
      scoredb: scoredbRequests(call),
    }),
    gbOwn: new GbOwnState(bus, view.prefs, view.singleFactor),
  };
}
