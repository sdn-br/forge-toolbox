// All stores of one world, built in one place: a new store touches this file and nothing else in the wiring.
import { battlePersistence } from '../../persistence/battles/client';
import { incomingPersistence } from '../../persistence/incoming/client';
import { notePersistence } from '../../persistence/notes/client';
import { playerPersistence } from '../../persistence/players/client';
import { plunderPersistence } from '../../persistence/plunders/client';
import { shieldPersistence } from '../../persistence/shields/client';
import type { WorldId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { Call } from '../core/rpc';
import { BattleStore } from './battles';
import { CatalogStore } from './catalog';
import { CityStore } from './cities';
import { IncomingStore } from './incoming';
import { NoteStore } from './notes';
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
  research: ResearchStore;
  battles: BattleStore;
  plunders: PlunderStore;
  incoming: IncomingStore;
  shields: ShieldStore;
  notes: NoteStore;
}

/** `call` reaches the persistence in the service worker; `now` is the clock of the stores that keep times. */
export function createStores(world: WorldId, bus: ToolboxBus, call: Call, now: () => number = Date.now): Stores {
  return {
    session: new SessionStore(bus),
    players: new PlayerStore(bus, playerPersistence(call), now),
    cities: new CityStore(bus),
    catalog: new CatalogStore(bus),
    resources: new ResourceStore(bus),
    research: new ResearchStore(bus),
    battles: new BattleStore(bus, world, battlePersistence(call)),
    plunders: new PlunderStore(bus, world, plunderPersistence(call)),
    incoming: new IncomingStore(bus, world, incomingPersistence(call)),
    shields: new ShieldStore(bus, world, shieldPersistence(call), now),
    notes: new NoteStore(bus, world, notePersistence(call), now),
  };
}
