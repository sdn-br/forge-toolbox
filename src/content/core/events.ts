// Contracts of all domain events. A listener gets exactly this payload and reads the rest from the stores.
import type { GbWindowState } from '../../shared/gb-window-protocol';
import type { BuildingDefId, PlayerId } from '../../shared/ids';
import type { CityKey, PlayerSource, PvpMarkKind, Session } from '../../shared/model';
import { EventBus } from './bus';

export interface ToolboxEvents {
  'session.started': { session: Session };
  /** `source` is where the data came from, or `mark` when the player put a star on a player or took it away */
  'player.updated': { ids: PlayerId[]; source: PlayerSource | 'mark' | 'ignore' | PvpMarkKind };
  'city.ownChanged': { buildingIds?: number[]; reset: boolean };
  'city.visited': { owner: PlayerId };
  'city.visitedChanged': { owner: PlayerId; buildingIds: number[] };
  /** the game shows another city, as far as its traffic tells */
  'city.shown': { city: CityKey };
  /** the buildings marked with arrows in the game changed: set, cleared, or dismissed in the game */
  'markers.changed': Record<string, never>;
  /** the selection of buildings in the own city changed */
  'selection.changed': Record<string, never>;
  'catalog.updated': { defs: BuildingDefId[] };
  /** the asset index of the game arrived; boxes with game images draw again */
  'assets.loaded': Record<string, never>;
  /** the main city grid arrived */
  'catalog.grid': Record<string, never>;
  /** the resources of the player changed */
  'resources.changed': Record<string, never>;
  /** the inventory of the player arrived or changed */
  'inventory.changed': Record<string, never>;
  /** the research metadata or the research progress of the player arrived */
  'research.changed': Record<string, never>;
  /** the store wrote battles against these players to the database, once per write */
  'battle.recorded': { opponents: PlayerId[] };
  /** the store wrote plunders of these players to the database, once per write */
  'plunder.recorded': { opponents: PlayerId[] };
  /** the player plundered or tried to plunder this building, whether it worked or was repelled */
  'plunder.attempted': { opponent: PlayerId; entityId: number };
  /** the store wrote attacks of these players on the own city to the database, once per write */
  'incoming.recorded': { opponents: PlayerId[] };
  /** new city shields of these players */
  'shield.recorded': { players: PlayerId[] };
  /** the game opened the army window before a battle; the opponent is not known yet */
  'army.opened': { battleType: string };
  /** the page module read the opponent of the open pvp army window from the game engine; may never come */
  'army.target': { opponent: PlayerId };
  /** the page module saw another great building window in the game engine (see core/gb-window.ts); may never come */
  'gbWindow.changed': { state: GbWindowState };
  /** any change of the notes; `player` when it was the note of that player */
  'note.changed': { player?: PlayerId };
  /** new days of a player at foestats were read, or foestats did not answer */
  'foestats.updated': { player: PlayerId };
  /** the game opened the construction window of a great building; `own` when it belongs to the session player */
  'greatBuilding.opened': { owner: PlayerId; entityId: number; own: boolean };
  /** the open construction changed: its building, the rankings shown, an own contribution or a level up */
  'greatBuilding.changed': {
    owner: PlayerId;
    entityId: number;
    reason: 'entity' | 'ranking' | 'contributed' | 'leveled';
  };
  /** the player put or removed the star of a stored great building */
  'greatBuilding.marked': { owner: PlayerId; entityId: number; marked: boolean };
  /** the player ignored or released a stored great building */
  'greatBuilding.ignored': { owner: PlayerId; entityId: number; ignored: boolean };
  /**
   * the great building list of another player arrived (not the own one); `at` is when, `entityIds` its buildings.
   * `askedByGame`: the game asked for it itself, not the player (it came right after a building of that owner was opened
   * or paid into), so it opens and unfolds nothing
   */
  'greatBuildings.listed': {
    owner: PlayerId;
    entityIds: number[];
    at: number;
    askedByGame: boolean;
  };
  /** the town hall list of the own contributions arrived at `at`; `known()` has it once read */
  'greatBuildings.contributions': { at: number };
  /**
   * the store wrote what it learned about the buildings `entityIds` of `owner` to the database: a list, an opened or
   * changed building. The town hall list touches many owners and drops the rows of owners no longer in it, so it comes
   * once without an owner: then every owner may have changed
   */
  'greatBuildings.stored': { owner: PlayerId; entityIds: number[] } | { owner?: undefined };
  /** the factors per place of a building changed (any of the three levels); without `def` those of every building */
  'gbOwn.factorsChanged': { def?: string };
  /** the Ext of a building's level changed */
  'gbOwn.extChanged': { def: string; level: number };
}

export type ToolboxBus = EventBus<ToolboxEvents>;
export const createBus = (): ToolboxBus => new EventBus<ToolboxEvents>();
