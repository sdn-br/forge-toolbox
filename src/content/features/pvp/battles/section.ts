// The tab "Kämpfe": the summary of the battles the filter matches, which also gives the row count, and a slice of them.
import type { BattleFilter } from '../../../../shared/model';
import type { FeatureContext } from '../../../core/feature';
import type { PvpSection } from '../tabs';
import { battlesViewModel } from './view-model';

export function createBattlesSection(ctx: FeatureContext): PvpSection {
  return {
    async load({ opponents, withPlunder }, offset, limit) {
      const filter: BattleFilter = { opponents, ...(withPlunder && { withPlunder }) };
      const [summary, battles] = await Promise.all([
        ctx.battles.summary(filter),
        ctx.battles.list({ ...filter, limit, offset }),
      ]);
      return { build: (input) => battlesViewModel({ ...input, battles, summary, from: offset }), battles };
    },
  };
}
