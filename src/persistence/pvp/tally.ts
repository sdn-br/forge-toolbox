import type { Plunder } from '../../shared/model';
import { FORGE_POINTS } from '../../shared/resources';

export interface PlunderTally {
  /** successful plunders */
  plunders: number;
  repelled: number;
  /** Forge points over the successful plunders */
  fp: number;
}

/** adds one plunder to the tally: a repelled one only counts as repelled */
export function tallyPlunder(tally: PlunderTally, p: Plunder): void {
  if (p.outcome === 'repelled') {
    tally.repelled++;
    return;
  }
  tally.plunders++;
  tally.fp += p.resources[FORGE_POINTS] ?? 0;
}
