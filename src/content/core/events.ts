// Contracts of all domain events. A listener gets exactly this payload and reads the rest from the stores.
import type { BuildingDefId, PlayerId } from '../../shared/ids';
import type { PlayerSource } from '../../shared/model';
import type { Session } from '../stores/session';
import { EventBus } from './bus';

export interface ToolboxEvents {
  'session.started': { session: Session };
  'player.updated': { ids: PlayerId[]; source: PlayerSource };
  'city.ownChanged': { buildingIds?: number[]; reset: boolean };
  'city.visited': { owner: PlayerId };
  'city.visitedChanged': { owner: PlayerId; buildingIds: number[] };
  'catalog.updated': { defs: BuildingDefId[] };
  /** the main city grid arrived */
  'catalog.grid': Record<string, never>;
  /** the resources of the player changed */
  'resources.changed': Record<string, never>;
  /** the inventory of the player arrived or changed */
  'inventory.changed': Record<string, never>;
  /** the research metadata or the research progress of the player arrived */
  'research.changed': Record<string, never>;
  'battle.recorded': { opponent: PlayerId };
  'plunder.recorded': { opponent: PlayerId };
  'incoming.recorded': { attacker: PlayerId };
  /** new city shields of these players */
  'shield.recorded': { players: PlayerId[] };
  /** the game opened the army window before a battle; the opponent is not known yet */
  'army.opened': { battleType: string };
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
}

export type ToolboxBus = EventBus<ToolboxEvents>;
export const createBus = (): ToolboxBus => new EventBus<ToolboxEvents>();
