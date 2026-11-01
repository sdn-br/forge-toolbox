// The tab "Plünderungen": the plunder totals, which also give the row count, and the plunders of the page.
import type { FeatureContext } from '../../../core/feature';
import { PAGE_SIZE } from '../rows';
import type { PvpSection } from '../tabs';
import { plundersViewModel } from './view-model';

export function createPlundersSection(ctx: FeatureContext): PvpSection {
  return {
    async load(opponents, pageFor) {
      const plunderTotals = await ctx.plunders.totals(opponents);
      const page = pageFor(plunderTotals.count + plunderTotals.repelled);
      const plunders = await ctx.plunders.list({ opponents, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      return (input) => plundersViewModel({ ...input, plunders, plunderTotals });
    },
  };
}
