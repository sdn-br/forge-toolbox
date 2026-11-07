// Windowing of a long table: only a slice of the rows is drawn, a wheel step or one of two buttons moves it by a row.
// Shared by the snipe helper, the PvP box, the plunder list and the Powerleveln box (a fixed count of rows) and the
// investments (as many as fit).
import { html, type TemplateResult } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { clamp } from '../../shared/math';
import { t } from '../core/texts';
import { offButton } from './buttons';
import { headerIcons } from './icons';

export interface RowWindow {
  /** index of the first row in view, so also the number of rows hidden above */
  top: number;
  /** rows hidden below */
  below: number;
}

/** the offset kept inside the list, so a shorter list or a stale offset never leaves the table empty */
export const clampTop = (top: number, rows: number, visible: number): number => clamp(top, 0, rows - visible);

export function rowWindow(top: number, rows: number, visible: number): RowWindow {
  const clamped = clampTop(top, rows, visible);
  return { top: clamped, below: Math.max(0, rows - clamped - visible) };
}

/** the rows of the window */
export const rowsIn = <T>(rows: T[], { top, below }: RowWindow): T[] => rows.slice(top, rows.length - below);

const hidden = ({ top: above, below }: RowWindow) =>
  above > 0 && below > 0
    ? t('table.hiddenBoth', { above, below })
    : above > 0
      ? t('table.hiddenAbove', { count: above })
      : below > 0
        ? t('table.hiddenBelow', { count: below })
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

/** wheel travel in pixels for one row; a mouse wheel notch is larger and still moves one row (Nutzer, 2026-11-04: a
 * trackpad sends many small events and moved a row on each, far too fast) */
export const WHEEL_ROW_TRAVEL = 10;

const LINE_PIXELS = 16;

/** travel gathered per list frame since its last step, signed */
const wheelTravel = new WeakMap<Element, number>();

/** Gathers the wheel travel of a frame and returns the direction of a row step once it reaches `WHEEL_ROW_TRAVEL`, else
 * 0. At most one row per event; a change of direction starts over. */
function wheelStep(frame: Element, e: WheelEvent): number {
  const pixels = e.deltaMode === 0 ? e.deltaY : e.deltaY * (e.deltaMode === 1 ? LINE_PIXELS : WHEEL_ROW_TRAVEL);
  const before = wheelTravel.get(frame) ?? 0;
  const travel = Math.sign(before) === Math.sign(pixels) ? before + pixels : pixels;
  if (Math.abs(travel) < WHEEL_ROW_TRAVEL) {
    wheelTravel.set(frame, travel);
    return 0;
  }
  wheelTravel.set(frame, 0);
  return Math.sign(travel);
}

/** The frame around the table: the table area, the two buttons beside it and, when rows are hidden, the line of what is
 * hidden after it. The buttons always keep their room, greyed when nothing is hidden, so the table width never jumps.
 * The wheel over the frame steps a row and passes at the ends. */
export function windowedRows({ cls, table, window, scroll, measure }: WindowedRows): TemplateResult {
  const { top: above, below } = window;
  const scrolls = above > 0 || below > 0;
  const wheel = (e: WheelEvent) => {
    const step = Math.sign(e.deltaY);
    const frame = e.currentTarget as Element;
    if (!scrolls || step === 0 || (step < 0 ? above : below) === 0) {
      wheelTravel.delete(frame);
      return;
    }
    e.preventDefault();
    if (wheelStep(frame, e) !== 0) scroll(step);
  };
  return html`<div class="win-scroll ${cls}" @wheel=${wheel}>
      <div class="win-area" ${ref(measure)}>${table}</div>
      <div class="win-nav">
        ${offButton(above > 0, t('table.scrollUp'), headerIcons.chevronUp, () => scroll(-1))}
        ${offButton(below > 0, t('table.scrollDown'), headerIcons.chevronDown, () => scroll(1))}
      </div>
    </div>${scrolls ? html`<p class="muted win-hidden">${hidden(window)}</p>` : ''}`;
}
