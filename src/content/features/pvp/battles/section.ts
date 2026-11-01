// The tab "Kämpfe": the plunder totals above, the battle count and the battles of the page.
import type { FeatureContext } from '../../../core/feature';
import { PAGE_SIZE } from '../rows';
import type { PvpSection } from '../tabs';
import { battlesViewModel } from './view-model';

export function createBattlesSection(ctx: FeatureContext): PvpSection {
  return {
    async load(opponents, pageFor) {
      const [plunderTotals, summary] = await Promise.all([
        ctx.plunders.totals(opponents),
        ctx.battles.summary({ opponents }),
      ]);
      const total = summary.battles;
      const page = pageFor(total);
      const battles = await ctx.battles.list({ opponents, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      return (input) => battlesViewModel({ ...input, battles, total, plunderTotals });
    },
  };
}
