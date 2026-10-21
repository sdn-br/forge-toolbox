import type { ToolboxBus } from '../core/events';

/** A technology that rewards expansions of the main city. */
export interface ResearchExpansion {
  tech: string;
  name: string;
  /** main city expansions it rewards */
  amount: number;
}

/**
 * The research tree as far as the expansions need it: the technologies with main city expansions from the metadata
 * `research-<hash>`, and the technologies the player unlocked. Nothing is persisted, every start sends both.
 */
export class ResearchStore {
  private techs?: ResearchExpansion[];
  private done?: ReadonlySet<string>;

  constructor(private bus: ToolboxBus) {}

  /** in the order of the metadata, that is along the tree; undefined until the metadata arrived */
  expansions(): ResearchExpansion[] | undefined {
    return this.techs;
  }

  /** undefined until the game sent the progress */
  unlocked(): ReadonlySet<string> | undefined {
    return this.done;
  }

  setExpansions(techs: ResearchExpansion[]): void {
    this.techs = [...techs];
    this.bus.emit('research.changed', {});
  }

  setUnlocked(ids: string[]): void {
    this.done = new Set(ids);
    this.bus.emit('research.changed', {});
  }
}
