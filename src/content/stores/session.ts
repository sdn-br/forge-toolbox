import type { Session } from '../../shared/model';
import type { ToolboxBus } from '../core/events';

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
