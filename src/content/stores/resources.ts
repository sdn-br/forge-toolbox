import type { ToolboxBus } from '../core/events';
import type { ResourceId } from './city-model';

/** The resources of the player as the game reported them last. Nothing is persisted, every start sends them. */
export class ResourceStore {
  private bag?: Record<ResourceId, number>;

  constructor(private bus: ToolboxBus) {}

  /** false until the game sent the resources */
  get known(): boolean {
    return this.bag !== undefined;
  }

  /** 0 for resources the player has none of */
  amount(id: ResourceId): number {
    return this.bag?.[id] ?? 0;
  }

  set(bag: Record<ResourceId, number>): void {
    this.bag = { ...bag };
    this.bus.emit('resources.changed', {});
  }
}
