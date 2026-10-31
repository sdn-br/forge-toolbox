// How a snipe hit reads, in the snipe helper and in the possible investments: profit, row notes, tier icon, the cells
// of the best place, their sort keys and the widths of the columns the hit lists share with the own investments.
import { html, type TemplateResult } from 'lit-html';
import { formatAge, formatNumber, signed, t } from '../core/texts';
import {
  type OwnerShare,
  type SnipeHit,
  type SnipePlace,
  type SnipeTier,
  snipeProfitKey,
  TIER_ORDER,
} from '../domain/gb-snipe';
import { estimateCell } from './estimate-cell';
import { progressPercent } from './fp-bar';
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

/** the owner's share as its own cell: "320", "?" when unknown; `stale` when drawn muted, with its age as the tip */
export interface OwnerShareCell {
  text: string;
  stale: boolean;
  tip: string;
}

export const ownerShareCell = (share: OwnerShare, now: number): OwnerShareCell =>
  share.state === 'unknown'
    ? { text: '?', stale: false, tip: '' }
    : {
        text: formatNumber(share.fp),
        stale: share.state === 'stale',
        tip: share.state === 'stale' ? t('investments.shareStale', { age: formatAge(now - share.at) }) : '',
      };

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

/** the best place of a hit as drawn: `profit` the best case, `range` the range for its tooltip when not exact */
export interface HitVm {
  rank: number;
  cost: string;
  profit: string;
  range?: string;
  /** the rewards are estimated */
  estimate: boolean;
  tier: SnipeTier;
}

export const hitVm = (h: SnipeHit): HitVm => {
  const range = snipeProfitRange(h);
  return {
    rank: h.place.rank,
    cost: formatNumber(h.place.cost),
    profit: snipeProfit(h),
    ...(range !== undefined && { range }),
    estimate: h.estimate,
    tier: h.tier,
  };
};

/** Platz, Einsatz, Gewinn, Sicherheit of the best place */
export const hitCells = (h: HitVm) =>
  html`<td class="num">${t('gb.rank', { rank: h.rank })}</td>
  <td class="num" data-tip=${t('snipe.costHint')}>${h.cost}</td>
  ${profitCell(h.profit, h.estimate, h.range)}
  ${tierCell(h.tier)}`;

export type HitColumn = 'progress' | 'rank' | 'cost' | 'profit' | 'tier';

/** Sort keys of the columns a hit list shares: the progress of the level, the rest of its best place, undefined for a
 * row without a hit (it goes last). */
export const hitSortKeys = <R>(
  level: (r: R) => { invested: number; required: number },
  hit: (r: R) => SnipeHit | undefined,
): Record<HitColumn, (r: R) => number | undefined> => ({
  progress: (r) => {
    const l = level(r);
    return progressPercent(l.invested, l.required);
  },
  rank: (r) => hit(r)?.place.rank,
  cost: (r) => hit(r)?.place.cost,
  profit: (r) => {
    const h = hit(r);
    return h && snipeProfitKey(h);
  },
  tier: (r) => {
    const h = hit(r);
    return h && TIER_ORDER[h.tier];
  },
});

/** Widths in px of the columns the snipe list and the investment tables share, so heads show whole: the progress and the
 * cost only in the two hit lists (the own investments keep a wider progress). */
export const HIT_COLUMN_WIDTHS = {
  /** the star head with arrow and level number needs 29 px plus 4 px padding */
  mark: 34,
  /** sortable heads fit their word, the arrow and a level number (measured: "Stufe ▾2" 56 px) */
  level: 56,
  rank: 56,
  /** measured: "8.371 / 11.122" 83 px, the head "Fortschritt ▾2" 88 px, room up to "19.999 / 24.000" */
  progress: 96,
  /** measured: "Einsatz ▾2" 67 px */
  cost: 68,
  /** the best case only, "≈ +12.345" at most; the range is in the tooltip */
  profit: 64,
  /** icon heads (tier, status): icon, arrow and level number 29 px */
  icon: 32,
};

const w = HIT_COLUMN_WIDTHS;

/** the widths above as CSS; part of `baseCss` */
export const hitColumnsCss = `
:is(.snipe-table, .inv-table) .c-mark { width: ${w.mark}px; }
:is(.snipe-table, .inv-table) .c-level { width: ${w.level}px; }
:is(.snipe-table, .inv-table) .c-rank { width: ${w.rank}px; }
:is(.snipe-table, .inv-table) .c-profit { width: ${w.profit}px; }
:is(.snipe-table, .inv-table) :is(.c-tier, .c-status) { width: ${w.icon}px; }
:is(.snipe-table, .inv-possible) .c-progress { width: ${w.progress}px; }
:is(.snipe-table, .inv-possible) .c-cost { width: ${w.cost}px; }
`;
