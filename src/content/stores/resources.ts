import type { ToolboxBus } from '../core/events';
import type { ResourceId } from '../model/city';

/** The resources of the player as the game reported them last, with the updates since. Nothing is persisted. */
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

  /** adds to one resource of a known stock; before the stock is known there is nothing to add to */
  add(id: ResourceId, amount: number): void {
    if (!this.bag || amount === 0) return;
    this.bag = { ...this.bag, [id]: (this.bag[id] ?? 0) + amount };
    this.bus.emit('resources.changed', {});
  }

  set(bag: Record<ResourceId, number>): void {
    this.bag = { ...bag };
    this.bus.emit('resources.changed', {});
  }
}
