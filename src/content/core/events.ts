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
  'battle.recorded': { opponent: PlayerId };
  'plunder.recorded': { opponent: PlayerId };
  'incoming.recorded': { attacker: PlayerId };
  /** the game opened the army window before a battle; the opponent is not known yet */
  'army.opened': { battleType: string };
  /** any change of the notes; `player` when it was the note of that player */
  'note.changed': { player?: PlayerId };
}

export type ToolboxBus = EventBus<ToolboxEvents>;
export const createBus = (): ToolboxBus => new EventBus<ToolboxEvents>();
