// How a snipe hit reads, in the snipe helper and in the possible investments: profit, row notes, tier icon.
import { html, type TemplateResult } from 'lit-html';
import { formatAge, formatNumber, signed, t } from '../core/texts';
import type { OwnerShare, SnipeHit, SnipePlace, SnipeTier } from '../domain/gb-snipe';
import { estimateCell } from './estimate-cell';
import { headerIcons } from './icons';

/** the best case, "+310"; the tier beside it tells how sure it is, the range goes to the tooltip */
export const snipeProfit = (h: SnipeHit): string => signed(h.profitHigh);

/** "Gewinn +40 bis +310" for the tooltip of the profit; nothing when exact */
export const snipeProfitRange = (h: SnipeHit): string | undefined =>
  h.profitLow === h.profitHigh
    ? undefined
    : t('snipe.profitRange', { low: signed(h.profitLow), high: signed(h.profitHigh) });

const worstNote = (w: SnipePlace) =>
  t('snipe.worst', { rank: w.rank, cost: formatNumber(w.cost), profit: signed(w.profit) });

/** "Eigenanteil: 320 FP" for the progress tooltip, with the age of the ranking when it is stale; nothing when unknown */
export const ownerShareNote = (share: OwnerShare, now: number) =>
  share.state === 'unknown'
    ? undefined
    : share.state === 'current'
      ? t('snipe.owner', { fp: formatNumber(share.fp) })
      : t('snipe.ownerStale', { fp: formatNumber(share.fp), age: formatAge(now - share.at) });

/** lines of the row tooltip: the place of the worst case, a building that may be locked */
export const snipeNotes = (h: SnipeHit): string[] =>
  [h.worst && worstNote(h.worst), h.maybeLocked && t('snipe.maybeLocked')].filter(
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

/** the profit, marked when the rewards are estimated; the range of a not exact profit in the tooltip */
export const profitCell = (profit: string, estimate: boolean, range?: string) =>
  estimateCell(profit, estimate, [range]);
