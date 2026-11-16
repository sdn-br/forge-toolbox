// The tab "Arena": the summary of the arena log lines the filter matches, which also gives the row count, a slice of the
// lines and the stored battles of its attacks.
import type { PlayerId } from '../../../../shared/ids';
import type { ArenaLogEntry, ArenaLogFilter, ArenaLogSummary, OpponentScope } from '../../../../shared/model';
import type { FeatureContext } from '../../../core/feature';
import type { KindFilter } from '../rows';
import type { PvpSection } from '../tabs';
import { matchBattles } from './match';
import { arenaViewModel } from './view-model';

/** the lines the scope and the kind toggles ask for; with both kinds off no opponent, so no line */
export function arenaFilter(scope: OpponentScope, kinds: KindFilter): ArenaLogFilter {
  if (kinds.attack && kinds.defense) return scope;
  if (kinds.attack) return { ...scope, kind: 'attack' };
  if (kinds.defense) return { ...scope, kind: 'defense' };
  return { opponents: [] };
}

/** the opponents of the attacks among the lines, each once */
const attacked = (lines: ArenaLogEntry[]): PlayerId[] => [
  ...new Set(lines.filter((l) => l.kind === 'attack').map((l) => l.opponent)),
];

export function createArenaSection(ctx: FeatureContext): PvpSection {
  return {
    async load({ scope, kinds }, offset, limit, totals) {
      const filter = arenaFilter(scope, kinds);
      // the box hands in the summary it read for this query; reading it walks every line of the world
      const [summary, lines] = await Promise.all([
        (totals as ArenaLogSummary | undefined) ?? ctx.arena.log.summary(filter),
        ctx.arena.log.list({ ...filter, limit, offset }),
      ]);
      // One read for the battles of the slice: those of its attacked opponents, newest first. Every battle comes with
      // its line, so the battles of these opponents newer than the slice are at most as many as the lines above it;
      // one more slice covers the lines just below it that a battle may have started before.
      const opponents = attacked(lines);
      const read = opponents.length
        ? await ctx.arena.battles.list({ opponents, limit: offset + 2 * limit, offset: 0 })
        : [];
      const matched = matchBattles(lines, read);
      return {
        build: (input) => arenaViewModel({ ...input, lines, matched, summary, from: offset }),
        totals: summary,
        battles: matched.filter((b) => b !== undefined),
      };
    },
  };
}
