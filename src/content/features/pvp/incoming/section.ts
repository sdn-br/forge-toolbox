// The tab "Angriffe auf mich": the totals of the attacks on the own city, which also give the row count, and a slice of
// the attacks.
import type { FeatureContext } from '../../../core/feature';
import type { PvpSection } from '../tabs';
import { incomingViewModel } from './view-model';

export function createIncomingSection(ctx: FeatureContext): PvpSection {
  return {
    async load({ opponents }, offset, limit) {
      const [incomingTotals, incoming] = await Promise.all([
        ctx.incoming.totals(opponents),
        ctx.incoming.list({ opponents, limit, offset }),
      ]);
      return { build: (input) => incomingViewModel({ ...input, incoming, incomingTotals, from: offset }), battles: [] };
    },
  };
}
