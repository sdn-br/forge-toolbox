// The tab "Kämpfe": the summary of the battles the filter matches, which also gives the row count, and a slice of them.
import type { BattleFilter, BattleSummary, OpponentScope } from '../../../../shared/model';
import type { FeatureContext } from '../../../core/feature';
import type { LootFilter } from '../rows';
import type { PvpSection } from '../tabs';
import { battlesViewModel } from './view-model';

/** the battles the scope and the sack toggles ask for; with both sacks off no opponent, so no battle */
export function battleFilter(scope: OpponentScope, loot: LootFilter): BattleFilter {
  if (loot.with && loot.without) return scope;
  if (loot.with) return { ...scope, plunder: 'with' };
  if (loot.without) return { ...scope, plunder: 'without' };
  return { opponents: [] };
}

export function createBattlesSection(ctx: FeatureContext): PvpSection {
  return {
    async load({ scope, loot }, offset, limit, totals) {
      const filter = battleFilter(scope, loot);
      // the box hands in the summary it read for this query; reading it walks every battle of the world
      const [summary, battles] = await Promise.all([
        (totals as BattleSummary | undefined) ?? ctx.battles.summary(filter),
        ctx.battles.list({ ...filter, limit, offset }),
      ]);
      return {
        build: (input) => battlesViewModel({ ...input, battles, summary, from: offset }),
        totals: summary,
        battles,
      };
    },
  };
}
