// The tab "LG-Finder": every stored building of others, filtered in memory.
import type { TemplateResult } from 'lit-html';
import type { KnownGreatBuilding } from '../../../../shared/model';
import type { FeatureContext } from '../../../core/feature';
import type { Box } from '../../../ui/box';
import { createTabState, lastResult, type TabFrame } from '../rows';
import { type FinderActions, finderView } from './view';
import {
  DEFAULT_FINDER_FILTER,
  DEFAULT_FINDER_SORT,
  FINDER_DESC_FIRST,
  type FinderRows,
  finderRows,
  finderViewModel,
} from './view-model';

export interface FinderSection {
  render(frame: TabFrame, buildings: KnownGreatBuilding[]): TemplateResult;
}

export function createFinderSection(ctx: FeatureContext, box: Box, measure: FinderActions['measure']): FinderSection {
  const draw = createTabState(ctx, box, measure, {
    prefKey: 'investments.finderFilter',
    defaults: DEFAULT_FINDER_FILTER,
    defaultSort: DEFAULT_FINDER_SORT,
    descFirst: FINDER_DESC_FIRST,
  });
  const rows = lastResult<FinderRows>();
  return {
    render: ({ lookups, visible, now, revision }, buildings) =>
      draw((choices) => {
        const input = { buildings, visible, now, ...choices, ...lookups };
        return finderViewModel(
          input,
          rows([buildings, choices.sort, choices.filter, revision], () => finderRows(input)),
        );
      }, finderView),
  };
}
