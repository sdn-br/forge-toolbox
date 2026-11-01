// The tab "Angriffe auf mich": the totals of the attacks on the own city, which also give the row count, and a slice of
// the attacks.
import type { IncomingTotals } from '../../../../shared/model';
import type { FeatureContext } from '../../../core/feature';
import type { PvpSection } from '../tabs';
import { incomingViewModel } from './view-model';

export function createIncomingSection(ctx: FeatureContext): PvpSection {
  return {
    async load({ opponents }, offset, limit, totals) {
      // the box hands in the totals it read for this query
      const [incomingTotals, incoming] = await Promise.all([
        (totals as IncomingTotals | undefined) ?? ctx.incoming.totals(opponents),
        ctx.incoming.list({ opponents, limit, offset }),
      ]);
      return {
        build: (input) => incomingViewModel({ ...input, incoming, incomingTotals, from: offset }),
        totals: incomingTotals,
        battles: [],
      };
    },
  };
}
