// The tab "Meine Investitionen": the own places in buildings of others, with their totals.
import type { TemplateResult } from 'lit-html';
import type { FeatureContext } from '../../../core/feature';
import type { Investments } from '../../../domain/investments';
import type { Box } from '../../../ui/box';
import { createTabState, type TabFrame } from '../rows';
import { type InvestmentsActions, investmentsView } from './view';
import { DEFAULT_MINE_FILTER, INVESTMENT_DESC_FIRST, investmentsViewModel } from './view-model';

export interface MineSection {
  render(frame: TabFrame, investments: Investments): TemplateResult;
}

export function createMineSection(ctx: FeatureContext, box: Box, measure: InvestmentsActions['measure']): MineSection {
  const draw = createTabState(ctx, box, measure, {
    // kept apart from the filters of the possible investments
    prefKey: 'investments.mineFilter',
    defaults: DEFAULT_MINE_FILTER,
    defaultSort: [],
    descFirst: INVESTMENT_DESC_FIRST,
  });
  return {
    render: ({ lookups, visible, now }, investments) =>
      draw(
        (choices) =>
          investmentsViewModel({
            investments,
            listedAt: ctx.greatBuildings.contributionsAt(),
            now,
            visible,
            ...choices,
            ...lookups,
          }),
        investmentsView,
      ),
  };
}
