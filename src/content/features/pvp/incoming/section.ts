// The tab "Angriffe auf mich": the totals of the attacks on the own city, which also give the row count, and the attacks of the page.
import type { FeatureContext } from '../../../core/feature';
import { PAGE_SIZE } from '../rows';
import type { PvpSection } from '../tabs';
import { incomingViewModel } from './view-model';

export function createIncomingSection(ctx: FeatureContext): PvpSection {
  return {
    async load(opponents, pageFor) {
      const incomingTotals = await ctx.incoming.totals(opponents);
      const page = pageFor(incomingTotals.battles + incomingTotals.plunders);
      const incoming = await ctx.incoming.list({ opponents, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      return (input) => incomingViewModel({ ...input, incoming, incomingTotals });
    },
  };
}
