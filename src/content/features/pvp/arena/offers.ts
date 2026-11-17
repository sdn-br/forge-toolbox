// The block "Gegner jetzt" on top of the attacks: the opponents the arena offers right now, with what the game says of
// their defense army and the own record against them.
import type { ArenaDifficulty, ArenaOpponent } from '../../../../shared/model';
import { formatNumber, formatPercent, formatWhen, signed, t } from '../../../core/texts';
import { type OpponentVm, opponentVm, type ViewInput } from '../rows';

/** the own attacks on an offered opponent, from the arena log */
export interface ArenaOfferRecord {
  won: number;
  lost: number;
  /** the sum of the points of these attacks */
  points: number;
  /** the time of the last attack in ms, none without one */
  lastAt?: number;
}

/** an opponent on offer with the own record against them */
export interface ArenaOffer {
  opponent: ArenaOpponent;
  record: ArenaOfferRecord;
}

/** a row of the block */
export interface OfferRow extends Omit<OpponentVm, 'plunderWorthy' | 'noAttack'> {
  /** the arena's own mark; undefined for a player the store does not know, who cannot be marked */
  arenaNoAttack?: boolean;
  /** marked as not to attack in the arena: the row warns */
  warn: boolean;
  difficulty: ArenaDifficulty;
  /** "leicht", "mittel", "schwer" */
  difficultyWord: string;
  /** the era of the opponent for the tooltip of the difficulty, when the catalog names it */
  era?: string;
  /** the points a win brings, "+628" */
  reward: string;
  /** the boosts of the opponent's defense army, in percent, "11.674 %" */
  attackBoost: string;
  defenseBoost: string;
  /** own wins and losses against the opponent, "3:1" */
  record: string;
  recordTip: string;
}

const recordTip = ({ won, lost, points, lastAt }: ArenaOfferRecord, now: number) =>
  won + lost === 0
    ? t('pvp.arena.offer.recordNone')
    : t('pvp.arena.offer.recordTip', {
        won: formatNumber(won),
        lost: formatNumber(lost),
        points: signed(points),
        when: lastAt === undefined ? '' : formatWhen(lastAt, now),
      });

/** the rows in the order the game sends the opponents */
export const offerRows = (input: ViewInput, offers: ArenaOffer[]): OfferRow[] =>
  offers.map(({ opponent: o, record }) => {
    const { plunderWorthy: _, noAttack: __, ...player } = opponentVm(input, o.player);
    const arenaNoAttack = input.lookups.arenaNoAttack(o.player);
    const era = input.eraName?.(o.era);
    return {
      ...player,
      ...(arenaNoAttack !== undefined && { arenaNoAttack }),
      warn: arenaNoAttack === true,
      difficulty: o.difficulty,
      difficultyWord: t(`pvp.arena.offer.${o.difficulty}`),
      ...(era && { era }),
      reward: signed(o.rewardPoints),
      attackBoost: formatPercent(o.attackBoost),
      defenseBoost: formatPercent(o.defenseBoost),
      record: `${record.won}:${record.lost}`,
      recordTip: recordTip(record, input.now),
    };
  });
