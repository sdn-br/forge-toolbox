// The tab "Mögliche Investitionen": the known buildings of others and which of them may pay a place.
import type { TemplateResult } from 'lit-html';
import type { FeatureContext } from '../../../core/feature';
import type { PossibleInvestment } from '../../../domain/investments';
import type { Box } from '../../../ui/box';
import { createTabState, lastResult, type TabFrame } from '../rows';
import { type PossibleActions, possibleView } from './view';
import {
  DEFAULT_FILTER,
  DEFAULT_POSSIBLE_SORT,
  POSSIBLE_DESC_FIRST,
  type PossibleRows,
  possibleRows,
  possibleViewModel,
} from './view-model';

export interface PossibleSection {
  render(frame: TabFrame, candidates: PossibleInvestment[]): TemplateResult;
}

export function createPossibleSection(
  ctx: FeatureContext,
  box: Box,
  measure: PossibleActions['measure'],
): PossibleSection {
  const draw = createTabState(ctx, box, measure, {
    prefKey: 'investments.filter',
    defaults: DEFAULT_FILTER,
    defaultSort: DEFAULT_POSSIBLE_SORT,
    descFirst: POSSIBLE_DESC_FIRST,
  });
  const rows = lastResult<PossibleRows>();
  return {
    render: ({ lookups, visible, now, revision }, candidates) =>
      draw((choices) => {
        const input = { candidates, visible, now, ...choices, ...lookups };
        return possibleViewModel(
          input,
          rows([candidates, choices.sort, choices.filter, revision], () => possibleRows(input)),
        );
      }, possibleView),
  };
}
