// The own great building: what helpers pay per place at a factor, what the owner pays in before each so the place is
// safe once paid, and what is left to the owner in the end.
import { roundHalfUp } from '../../shared/math';
import type { RankingRow } from '../model/great-building';
import { ownDeposit, paidPlaces, plusPercent } from './gb-calculator';

export interface OwnShareInput {
  /** Forge points the current level needs */
  required: number;
  rankings: RankingRow[];
  /**
   * factor in percent the owner offers, e.g. 90 pays 1.9 times the reward; a list gives one per place, index 0 is
   * place 1, a place past its end takes the last
   */
  factor: number | number[];
  /** make the places others hold already safe as well (Absichern); off leaves them as they are */
  secureExisting?: boolean;
  /** a place without a Forge point reward counts as one paid Forge point, as helpers take it for blueprints and medals */
  oneFpForNoReward?: boolean;
  /** trust that whoever paid in already adds nothing more (Vertrauen): only newcomers can pass a place */
  trust?: boolean;
  /** promised payments not made yet (Ext), counted as if paid; their order does not matter */
  exts?: number[];
}

export interface OwnPlace {
  rank: number;
  /** reward as the game names it, before the Arc bonus of the helper */
  net: number;
  /** who keeps the place, with his deposit; `ext` for a promised payment; missing where a helper pays */
  holder?: Holder;
  /** what is on the place: the holder's deposit, or for a free place what a helper pays at the factor */
  amount: number;
  /** what a helper pays for the place at the factor, the reward grown by it */
  ask: number;
  /** what the owner pays in before this place so nobody can pass it afterwards; 0 when it holds already */
  advance: number;
  /** nothing is left for the place: the level is full before it */
  full: boolean;
  /** the helper's payment fills the level */
  levels: boolean;
  /** no Forge point reward and not counted with one: nobody is asked to pay, it gets no own Forge points before it */
  unoffered?: boolean;
  /**
   * a free place a sniper can take before the helper pays: what he gains at the same factor, the payment minus the
   * safe cost at that moment; missing below a few Forge points
   */
  danger?: number;
}

export interface OwnShareCalc {
  places: OwnPlace[];
  /** what the owner pays in for the whole level: required minus all others, the planned free places counted */
  ownShare: number;
  /** what the owner has paid in already */
  myDeposit: number;
  /** still to pay by the owner: own share minus the own deposit */
  open: number;
  /** what the owner pays after the last place to finish the level */
  rest: number;
  /** Forge points until the level is full, by the rankings and the promised payments */
  missing: number;
  /** the free places from the top that need no own Forge points first, the ones to hand out right away */
  safeRanks: number[];
  /** deposits below the paid places, ranks and their sum, e.g. placeholders a helper pushed down */
  pushed?: { from: number; to: number; fp: number };
}

interface Holder {
  name: string;
  fp: number;
  ext?: boolean;
}

/** the factor of a place: one for all, or the place's own from the list */
const factorAt = (factor: number | number[], rank: number) =>
  typeof factor === 'number' ? factor : (factor[rank - 1] ?? factor.at(-1) ?? 0);

/** a sniper gain below this is not worth a warning */
const DANGER_MIN = 5;

/**
 * Walks the paid places from the top, as helpers usually fill them. A deposit keeps its place when it is at least the
 * payment of a helper (or all that is missing); a smaller one, a placeholder, is pushed down by the helper and counts
 * as a holder below. A place is safe when what is still missing after it, added to the strongest holder below, does
 * not pass it; on a tie the earlier deposit keeps the place. Each advance and each payment shrinks what is missing for
 * the next place.
 */
export function calculateOwnShare(input: OwnShareInput): OwnShareCalc {
  const { rankings, required, factor, secureExisting = true, trust = false, oneFpForNoReward = false } = input;
  const myDeposit = ownDeposit(rankings);
  // deposits of others, strongest first; a promised payment ranks behind an equal real one, which came first
  const holders: Holder[] = [
    ...rankings.filter((r) => !r.self && r.fp !== undefined).map((r) => ({ name: r.name, fp: r.fp as number })),
    ...(input.exts ?? []).filter((fp) => fp > 0).map((fp) => ({ name: 'Ext', fp, ext: true })),
  ].sort((a, b) => b.fp - a.fp);
  const paid = paidPlaces(rankings);
  const others = holders.reduce((sum, h) => sum + h.fp, 0);
  // the deposits in place order as the walk plans them; helpers' payments go in and push smaller deposits down
  const slots: (Holder | number)[] = [...holders];
  const fpAt = (i: number) => {
    const slot = slots[i];
    return slot === undefined ? 0 : typeof slot === 'number' ? slot : slot.fp;
  };
  // with trust the deposits below cannot grow, so only a newcomer can pass
  const below = (i: number) => (trust ? 0 : fpAt(i));

  const missingNow = required - myDeposit - others;
  let missing = missingNow;
  let planned = 0;
  const places: OwnPlace[] = [];
  paid.forEach((row, i) => {
    const rank = row.rank as number;
    const net = row.reward?.fp ?? 0;
    const ask = net === 0 && oneFpForNoReward ? 1 : plusPercent(net, factorAt(factor, rank));
    const slot = slots[i];
    if (slot !== undefined && typeof slot !== 'number' && (ask <= slot.fp || missing <= slot.fp)) {
      // the holder keeps the place: safe once the missing rest plus the strongest below does not pass him
      const advance = secureExisting ? Math.max(0, Math.min(missing, missing + below(i + 1) - slot.fp)) : 0;
      missing -= advance;
      places.push({ rank, net, holder: slot, amount: slot.fp, ask, advance, full: false, levels: false });
      return;
    }
    if (missing <= 0) {
      places.push({ rank, net, amount: 0, ask, advance: 0, full: true, levels: false });
      return;
    }
    // with nothing to pay out nobody pays: no own Forge points before it, the rest goes to the end; nothing is on the
    // slot (a holder would have kept it), so the places below keep theirs
    if (ask === 0) {
      places.push({ rank, net, amount: 0, ask, advance: 0, full: false, levels: false, unoffered: true });
      return;
    }
    // a helper takes the place and pushes what is on it down: after the advance and the payment, the rest plus that
    // deposit must not pass the payment
    const pushed = below(i);
    const advance = Math.max(0, Math.min(missing - ask, missing + pushed - 2 * ask));
    const before = missing - advance;
    const amount = Math.min(ask, before);
    const gain = amount - roundHalfUp((before + pushed) / 2);
    slots.splice(i, 0, amount);
    missing -= advance + amount;
    planned += amount;
    places.push({
      rank,
      net,
      amount,
      ask,
      advance,
      full: false,
      levels: amount > 0 && amount === before,
      ...(gain > DANGER_MIN && { danger: gain }),
    });
  });

  const safeRanks: number[] = [];
  for (const p of places) {
    if (p.advance > 0) break;
    if (!p.holder && !p.full && p.amount > 0) safeRanks.push(p.rank);
  }
  // deposits pushed past the paid places, like placeholders a helper took the place from
  const rest = slots.slice(paid.length).filter((s): s is Holder => typeof s !== 'number');
  const lastRank = (paid.at(-1)?.rank as number | undefined) ?? 0;
  const ownShare = required - others - planned;
  return {
    places,
    ownShare,
    myDeposit,
    open: ownShare - myDeposit,
    rest: Math.max(0, missing),
    missing: missingNow,
    safeRanks,
    ...(rest.length && {
      pushed: { from: lastRank + 1, to: lastRank + rest.length, fp: rest.reduce((sum, h) => sum + h.fp, 0) },
    }),
  };
}
