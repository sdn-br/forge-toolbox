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

  /** replaces the stock; no event when it equals the one held */
  set(bag: Record<ResourceId, number>): void {
    if (this.bag && sameBag(this.bag, bag)) return;
    this.bag = { ...bag };
    this.bus.emit('resources.changed', {});
  }
}

function sameBag(a: Record<ResourceId, number>, b: Record<ResourceId, number>): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => k in b && a[k as ResourceId] === b[k as ResourceId])
  );
}
