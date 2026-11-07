// A number cell whose value may be computed: then it stands italic with „≈“ and says so in the tooltip.
import { html } from 'lit-html';

/** `lines` go before the estimate's line in the tooltip; `tip` is that line. Without a line the tooltip is empty, so
 * the cell never shows the tooltip of its row. */
export const estimateCell = (
  content: unknown,
  estimate: boolean | undefined,
  lines: (string | undefined)[] = [],
  tip?: string,
) =>
  html`<td class=${estimate ? 'num estimate' : 'num'} data-tip=${[...lines, estimate ? tip : undefined]
    .filter((line) => line !== undefined)
    .join('\n')}>${estimate ? '≈ ' : ''}${content}</td>`;

/** stands where a number cell has nothing to show */
export const emptyCell = html`<td class="num">–</td>`;
