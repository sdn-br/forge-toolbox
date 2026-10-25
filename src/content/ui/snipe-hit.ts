// How a snipe hit reads, in the snipe helper and in the possible investments: profit, row notes, tier icon.
import { html, type TemplateResult } from 'lit-html';
import { formatAge, formatNumber, t } from '../core/texts';
import type { OwnerShare, SnipeHit, SnipePlace, SnipeTier } from '../domain/gb-snipe';
import { headerIcons } from './icons';

export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n))}`;

/** "+85" when exact, "+40 … +310" as a range */
export function snipeProfit(h: SnipeHit): string {
  return h.profitLow === h.profitHigh ? signed(h.profitHigh) : `${signed(h.profitLow)} … ${signed(h.profitHigh)}`;
}

/** sorts by the best case, the worst case breaking ties */
export const snipeProfitKey = (h: SnipeHit) => h.profitHigh * 1e9 + h.profitLow;

const worstNote = (w: SnipePlace) =>
  t('snipe.worst', { rank: w.rank, cost: formatNumber(w.cost), profit: signed(w.profit) });

/** "Eigentümer: 320 FP", with the age of the ranking when it is stale; nothing when unknown */
const ownerNote = (share: OwnerShare, now: number) =>
  share.state === 'unknown'
    ? undefined
    : share.state === 'current'
      ? t('snipe.owner', { fp: formatNumber(share.fp) })
      : t('snipe.ownerStale', { fp: formatNumber(share.fp), age: formatAge(now - share.at) });

/** lines of the row tooltip: the place of the worst case, a building that may be locked, what the owner paid in */
export const snipeNotes = (h: SnipeHit, now: number): string[] =>
  [h.worst && worstNote(h.worst), h.maybeLocked && t('snipe.maybeLocked'), ownerNote(h.ownerShare, now)].filter(
    (n): n is string => typeof n === 'string',
  );

export const tierIcon: Record<SnipeTier, TemplateResult> = {
  exact: headerIcons.check,
  safe: headerIcons.checkCircle,
  possible: headerIcons.questionCircle,
};

/** the tier as an icon, its word in the tooltip */
export const tierCell = (tier: SnipeTier) =>
  html`<td class=${`snipe-tier ${tier}`} data-tip=${t(`snipe.tier.${tier}`)} aria-label=${t(`snipe.tier.${tier}`)}>${tierIcon[tier]}</td>`;

/** the profit, marked when the rewards are estimated */
export const profitCell = (profit: string, estimate: boolean) =>
  html`<td class=${estimate ? 'num estimate' : 'num'} data-tip=${estimate ? t('gbCalc.estimate') : ''}>${
    estimate ? '≈ ' : ''
  }${profit}</td>`;

/** the tiers from the best: exact over safe over possible, for sorting */
export const TIER_ORDER: Record<SnipeTier, number> = { exact: 2, safe: 1, possible: 0 };
