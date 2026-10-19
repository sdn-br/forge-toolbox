import type { EraId, PlayerId, WorldId } from '../../shared/ids';
import type { GuildRef } from '../../shared/model';
import type { ToolboxBus } from '../core/events';

export interface Session {
  world: WorldId;
  playerId: PlayerId;
  name: string;
  era: EraId;
  guild?: GuildRef;
}

export class SessionStore {
  private session?: Session;

  constructor(private bus: ToolboxBus) {}

  get current(): Session | undefined {
    return this.session;
  }

  start(session: Session): void {
    this.session = session;
    this.bus.emit('session.started', { session });
  }
}
