// The thin bar under "paid in / costs", filled towards the level up (investments, GB calculator, snipe helper).
import { html, type TemplateResult } from 'lit-html';
import { formatNumber, type TextKey, t } from '../core/texts';

/** paid in of a level in percent, 0 to 100 */
export const progressPercent = (invested: number, required: number) =>
  required > 0 ? Math.min(100, (invested / required) * 100) : 0;

/** what a progress cell draws: paid in and costs formatted, the rest to the level up, the percent for the bar */
export interface ProgressVm {
  invested: string;
  required: string;
  rest: string;
  percent: number;
}

export const progressVm = (invested: number, required: number): ProgressVm => ({
  invested: formatNumber(invested),
  required: formatNumber(required),
  rest: formatNumber(Math.max(0, required - invested)),
  percent: progressPercent(invested, required),
});

export const fpBar = (percent: number) => html`<div class="fp-bar"><div style=${`width: ${percent}%`}></div></div>`;

/** a progress cell: "paid in / costs" over the bar, `extra` beside the bar (the growth), the rest to the level up in the
 * tooltip, below it `notes` */
export const progressCell = (
  p: ProgressVm,
  extra: TemplateResult | '' = '',
  notes: string[] = [],
) => html`<td class="num progress-cell" data-tip=${[t('table.restHint', { rest: p.rest, required: p.required }), ...notes].join('\n')}>
    ${p.invested} / ${p.required}
    <div class="fp-line">${fpBar(p.percent)}${extra}</div>
  </td>`;

/** "+X" small beside the bar, what others paid in; the tooltip says since when */
export const growthTag = (growth: string | undefined, hint: TextKey) =>
  growth ? html`<span class="growth-tag" data-tip=${t(hint, { growth })}>${t('table.growth', { growth })}</span>` : '';
