import type { ArenaBattle, ArenaLogEntry, ArenaLogSummary } from '../../../../shared/model';
import { formatWhen, signed, t } from '../../../core/texts';
import { formatArenaAttackSummary, formatArenaDefenseSummary } from '../../shared/pvp-format';
import { type ArenaKind, isFiltered, type ListVm, listVm, type OpponentVm, opponentVm, type ViewInput } from '../rows';
import { type ArenaOffer, type OfferRow, offerRows } from './offers';

/** an own attack won or a defense held (points above 0), or lost (points below 0) */
export type ArenaOutcome = 'won' | 'lost';

const RESULT = {
  attack: { won: 'pvp.arena.won', lost: 'pvp.arena.lost' },
  defense: { won: 'pvp.arena.defenseWon', lost: 'pvp.arena.defenseLost' },
} as const;

/** a line of the arena log */
export interface ArenaRow extends OpponentVm {
  /** the time of the line in ms, with the opponent it names a defense line */
  at: number;
  when: string;
  /** from the sign of the points, for attacks and defenses alike (Nutzer, 2026-11-17); none for 0 points */
  outcome?: ArenaOutcome;
  /** the word, for the tooltip of the icon */
  result?: string;
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

/** `totals` are the summary of the lines of the sub tab the filter matches */
export interface ArenaVm extends ListVm {
  tab: 'arena';
  kind: ArenaKind;
  /** the loaded rows, the first at `from` */
  rows: ArenaRow[];
  /** the opponents on offer, on the attacks only and only once the arena has been opened */
  offers?: OfferRow[];
}

/** what the side panel shows of a defense line: the attacker and the line, no battle (the game sends none) */
export interface DefensePanelVm {
  name: string;
  guild?: { name: string; url: string };
  when: string;
  points: string;
  gain: ArenaRow['gain'];
}

export const defensePanelVm = (row: ArenaRow, guild?: { name: string; url: string }): DefensePanelVm => ({
  name: row.name,
  ...(guild && { guild }),
  when: row.when,
  points: row.points,
  gain: row.gain,
});

export function arenaViewModel(
  input: ViewInput & {
    /** the sub tab; its lines are the ones in `lines` */
    kind: ArenaKind;
    lines: ArenaLogEntry[];
    /** the stored battle of each line, in the order of `lines` */
    matched: (ArenaBattle | undefined)[];
    /** over all lines the filter matches */
    summary: ArenaLogSummary;
    /** the index of the first loaded line in the list */
    from: number;
    /** the opponents on offer now, in the order the game sends them */
    offers?: ArenaOffer[];
  },
): ArenaVm {
  const { kind, lines, matched, summary, now } = input;
  return {
    ...listVm({
      total: kind === 'attack' ? summary.attacks : summary.defenses,
      from: input.from,
      totals: kind === 'attack' ? formatArenaAttackSummary(summary) : formatArenaDefenseSummary(summary),
      filtered: isFiltered(input.filter, 'arena'),
    }),
    tab: 'arena',
    kind,
    ...(kind === 'attack' && input.offers?.length && { offers: offerRows(input, input.offers) }),
    rows: lines.map((line, i): ArenaRow => {
      const outcome: ArenaOutcome | undefined = line.points > 0 ? 'won' : line.points < 0 ? 'lost' : undefined;
      const battle = matched[i];
      const arenaNoAttack = input.lookups.arenaNoAttack(line.opponent);
      // the neighbourhood marks mean nothing in the arena: no plunder there, and another defense army
      const { plunderWorthy: _, noAttack: __, ...opponent } = opponentVm(input, line.opponent);
      return {
        ...opponent,
        ...(arenaNoAttack !== undefined && { arenaNoAttack }),
        at: line.at,
        when: formatWhen(line.at, now),
        ...(outcome && { outcome, result: t(RESULT[line.kind][outcome]) }),
        points: signed(line.points),
        gain: line.points > 0 ? 'good' : line.points < 0 ? 'bad' : 'none',
        ...(battle && { battleId: battle.battleId }),
        selected:
          line.kind === 'defense'
            ? input.selectedDefense?.opponent === line.opponent && input.selectedDefense.at === line.at
            : battle !== undefined && input.selected === battle.battleId,
      };
    }),
  };
}
