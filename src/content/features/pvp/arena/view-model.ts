import type { ArenaBattle, ArenaLogEntry, ArenaLogSummary } from '../../../../shared/model';
import { formatWhen, signed, t } from '../../../core/texts';
import { formatArenaSummary } from '../../shared/pvp-format';
import { isFiltered, type ListVm, listVm, type OpponentVm, opponentVm, type ViewInput } from '../rows';

/** an own attack won (points above 0) or lost, or a defense against another player's attack */
export type ArenaOutcome = 'won' | 'lost' | 'defense';

/** a line of the arena log */
export interface ArenaRow extends OpponentVm {
  when: string;
  outcome: ArenaOutcome;
  /** the word, for the tooltip of the icon */
  result: string;
  /** signed, "+400", "−535" */
  points: string;
  /** the colour of the points */
  gain: 'good' | 'bad' | 'none';
  /** the stored battle of an attack; without one the row cannot be selected */
  battleId?: number;
  /** the side panel shows this row's battle */
  selected: boolean;
  /** the arena's own mark; undefined for a player the store does not know, who cannot be marked */
  arenaNoAttack?: boolean;
}

/** `totals` are attacks, wins, defenses and points of the lines the filter matches */
export interface ArenaVm extends ListVm {
  tab: 'arena';
  /** the loaded rows, the first at `from` */
  rows: ArenaRow[];
}

const outcomeOf = (line: ArenaLogEntry): ArenaOutcome =>
  line.kind === 'defense' ? 'defense' : line.points > 0 ? 'won' : 'lost';

export function arenaViewModel(
  input: ViewInput & {
    lines: ArenaLogEntry[];
    /** the stored battle of each line, in the order of `lines` */
    matched: (ArenaBattle | undefined)[];
    /** over all lines the filter matches */
    summary: ArenaLogSummary;
    /** the index of the first loaded line in the list */
    from: number;
  },
): ArenaVm {
  const { lines, matched, summary, now } = input;
  return {
    ...listVm({
      total: summary.attacks + summary.defenses,
      from: input.from,
      totals: formatArenaSummary(summary),
      filtered: isFiltered(input.filter, 'arena'),
    }),
    tab: 'arena',
    rows: lines.map((line, i): ArenaRow => {
      const outcome = outcomeOf(line);
      const battle = matched[i];
      const arenaNoAttack = input.lookups.arenaNoAttack(line.opponent);
      // the neighbourhood marks mean nothing in the arena: no plunder there, and another defense army
      const { plunderWorthy: _, noAttack: __, ...opponent } = opponentVm(input, line.opponent);
      return {
        ...opponent,
        ...(arenaNoAttack !== undefined && { arenaNoAttack }),
        when: formatWhen(line.at, now),
        outcome,
        result: t(`pvp.arena.${outcome}`),
        points: signed(line.points),
        gain: line.points > 0 ? 'good' : line.points < 0 ? 'bad' : 'none',
        ...(battle && { battleId: battle.battleId }),
        selected: battle !== undefined && input.selected === battle.battleId,
      };
    }),
  };
}
