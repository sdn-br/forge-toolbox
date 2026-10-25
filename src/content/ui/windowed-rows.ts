// Windowing of a long table: only a slice of the rows is drawn, a wheel step or one of two buttons moves it by a row.
// Shared by the snipe helper (a fixed count of rows) and the investments box (as many as fit).
import { html, type TemplateResult } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { t } from '../core/texts';
import { headerIcons } from './icons';

export interface RowWindow {
  /** index of the first row in view */
  top: number;
  /** rows hidden above and below */
  above: number;
  below: number;
}

/** the offset kept inside the list, so a shorter list or a stale offset never leaves the table empty */
export const clampTop = (top: number, rows: number, visible: number): number =>
  Math.max(0, Math.min(top, rows - visible));

export function rowWindow(top: number, rows: number, visible: number): RowWindow {
  const clamped = clampTop(top, rows, visible);
  return { top: clamped, above: clamped, below: Math.max(0, rows - clamped - visible) };
}

/** the rows of the window */
export const rowsIn = <T>(rows: T[], { top, below }: RowWindow): T[] => rows.slice(top, rows.length - below);

/** one of the two scroll buttons; greyed at its end like the factor status buttons */
const navButton = (on: boolean, word: string, icon: TemplateResult, action: () => void) =>
  html`<button class=${on ? 'icon' : 'icon off'} aria-disabled=${on ? 'false' : 'true'} data-tip=${word}
    aria-label=${word} @click=${() => on && action()}>${icon}</button>`;

const hidden = ({ above, below }: RowWindow) =>
  above > 0 && below > 0
    ? t('snipe.hiddenBoth', { above, below })
    : above > 0
      ? t('snipe.hiddenAbove', { count: above })
      : below > 0
        ? t('snipe.hiddenBelow', { count: below })
        : '';

export interface WindowedRows {
  /** class of the frame, for the styles of the one table */
  cls: string;
  /** the table with only the rows of the window in its body */
  table: TemplateResult;
  window: RowWindow;
  /** moves the window by rows, down for positive; the owner keeps the offset inside the list */
  scroll(rows: number): void;
  /** gets the table area element on every render, for measuring how many rows fit (`rowFit`) */
  measure?: (area: Element | undefined) => void;
}

/** The frame around the table: the table area, the two buttons beside it (only when rows are hidden) and the line of
 * what is hidden after it. The wheel over the frame steps a row and passes at the ends. */
export function windowedRows({ cls, table, window, scroll, measure }: WindowedRows): TemplateResult {
  const { above, below } = window;
  const scrolls = above > 0 || below > 0;
  const wheel = (e: WheelEvent) => {
    const step = Math.sign(e.deltaY);
    if (!scrolls || step === 0 || (step < 0 ? above : below) === 0) return;
    e.preventDefault();
    scroll(step);
  };
  return html`<div class="win-scroll ${cls}" @wheel=${wheel}>
      <div class="win-area" ${ref(measure)}>${table}</div>
      ${
        scrolls
          ? html`<div class="win-nav">
            ${navButton(above > 0, t('snipe.scrollUp'), headerIcons.chevronUp, () => scroll(-1))}
            ${navButton(below > 0, t('snipe.scrollDown'), headerIcons.chevronDown, () => scroll(1))}
          </div>`
          : ''
      }
    </div>${scrolls ? html`<p class="muted win-hidden">${hidden(window)}</p>` : ''}`;
}
