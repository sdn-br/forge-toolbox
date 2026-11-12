// Which game response feeds which store: one module per area translates the game format and registers its handlers
// (`city.ts`, `players.ts`, `catalog.ts`, `pvp.ts`, `great-buildings.ts`, `resources.ts`). This file is the index. A
// response may have several handlers that each feed their own part, for example `updatePlayer` (players, plunder) and
// `CityMapService.reset` (plunder, own buildings, great buildings).
import type { Ingestion } from '../core/ingestion';
import { registerCatalog } from './catalog';
import { registerCity } from './city';
import type { GameHandlerDeps } from './deps';
import { registerGreatBuildings } from './great-buildings';
import { registerPlayers } from './players';
import { registerPvp } from './pvp';
import { registerResources } from './resources';

/**
 * The Ingestion calls the listeners of one message in registration order, so the order below is part of the behaviour.
 * It is the order the handlers had in one list before the split; where a module's handlers of one message must stay
 * behind another's, that is why it stands here:
 * - `city` first: it owns the session start and the `onMain` flag that its own `updatedEntities` reading needs, and its
 *   batch end shows the own city before pvp reads the visited one.
 * - `players` before `pvp`: `updatePlayer` applies the players before the plunder bookkeeping notes who was named.
 * - `pvp` before `great-buildings`: its batch end joins the plunder, then the great building contribution is applied.
 * - `great-buildings` before `resources`: the contribution is applied at batch end before the inventory commits what
 *   the same response brought (item stock, package Forge points).
 * Where two areas listen to the same message (`CityMapService.reset` and `updateEntity`, `OtherPlayerService.newEvent`,
 * `updatePlayer`) their handlers do not read each other's results, so only that they run in this fixed sequence counts.
 */
export function registerGameHandlers(ingestion: Ingestion, deps: GameHandlerDeps): void {
  registerCity(ingestion, deps);
  registerPlayers(ingestion, deps);
  registerCatalog(ingestion, deps);
  registerPvp(ingestion, deps);
  registerGreatBuildings(ingestion, deps);
  registerResources(ingestion, deps);
}
