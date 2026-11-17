// The tab "Arena", one sub tab at a time: the summary of the arena log lines of the sub tab the filter matches, which also gives the row count, a slice of the
// lines and the stored battles of its attacks.
import type { PlayerId } from '../../../../shared/ids';
import type { ArenaLogEntry, ArenaLogFilter, ArenaLogSummary, OpponentScope } from '../../../../shared/model';
import type { FeatureContext } from '../../../core/feature';
import type { ArenaKind } from '../rows';
import type { PvpSection } from '../tabs';
import { matchBattles } from './match';
import type { ArenaOffer } from './offers';
import { arenaViewModel } from './view-model';

/** the lines of the sub tab within the scope */
export const arenaFilter = (scope: OpponentScope, kind: ArenaKind): ArenaLogFilter => ({ ...scope, kind });

/** the opponents of the attacks among the lines, each once */
const attacked = (lines: ArenaLogEntry[]): PlayerId[] => [
  ...new Set(lines.filter((l) => l.kind === 'attack').map((l) => l.opponent)),
];

export function createArenaSection(ctx: FeatureContext): PvpSection {
  /** the opponents on offer with the own attacks on them; the block ignores the filters of the list */
  const readOffers = (): Promise<ArenaOffer[]> =>
    Promise.all(
      ctx.arena.opponents.current().map(async (opponent) => {
        const filter = { opponents: [opponent.player], kind: 'attack' as const };
        const [summary, [last]] = await Promise.all([
          ctx.arena.log.summary(filter),
          ctx.arena.log.list({ ...filter, limit: 1, offset: 0 }),
        ]);
        return {
          opponent,
          record: {
            won: summary.won,
            lost: summary.lost,
            points: summary.points,
            ...(last && { lastAt: last.at }),
          },
        };
      }),
    );

  return {
    async load({ scope, arenaKind }, offset, limit, totals) {
      const filter = arenaFilter(scope, arenaKind);
      // the box hands in the summary it read for this query; reading it walks every line of the world
      const [summary, lines, offers] = await Promise.all([
        (totals as ArenaLogSummary | undefined) ?? ctx.arena.log.summary(filter),
        ctx.arena.log.list({ ...filter, limit, offset }),
        arenaKind === 'attack' ? readOffers() : Promise.resolve([]),
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
        build: (input) => arenaViewModel({ ...input, kind: arenaKind, lines, matched, summary, from: offset, offers }),
        totals: summary,
        battles: matched.filter((b) => b !== undefined),
      };
    },
  };
}
