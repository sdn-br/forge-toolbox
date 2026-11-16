// Pure placement math of the marker arrows, apart from the engine so tests reach it.
import type { GridRect } from '../shared/marker-protocol';

export interface Point {
  x: number;
  y: number;
}

/** The grid point an arrow points at: the middle of the footprint. */
export function anchorOf(rect: GridRect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.length / 2 };
}

export interface CanvasBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * CSS pixels per stage unit. The stage may run in device pixels on a high-DPI screen, so the ratio of the shown canvas
 * width to the stage width covers devicePixelRatio and any CSS scaling at once. Without a usable stage width: 1.
 */
export function cssPerStage(canvas: CanvasBox, stageWidth: unknown): number {
  if (typeof stageWidth !== 'number' || !Number.isFinite(stageWidth) || stageWidth <= 0) return 1;
  return canvas.width / stageWidth;
}

/** A stage point (what the scene projection returns) in viewport CSS pixels. */
export function stageToViewport(point: Point, canvas: CanvasBox, scale: number): Point {
  return { x: canvas.left + point.x * scale, y: canvas.top + point.y * scale };
}

/** The arrow grows and shrinks with the game zoom, within limits so it stays readable. */
export function arrowScale(zoom: unknown): number {
  const z = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 1;
  return Math.min(1.5, Math.max(0.5, z));
}

/** Size of the drawn arrow and where its tip sits, in CSS pixels at scale 1. */
export const ARROW = { width: 92, height: 108, gap: 14, bob: 20 } as const;

/**
 * Where the top left corner of the arrow goes, relative to the anchor at scale 1: centered above it, the tip `gap`
 * pixels above the anchor.
 */
export const arrowOffset = (): Point => ({ x: -ARROW.width / 2, y: -(ARROW.height + ARROW.gap) });

/** Whether a viewport point lies on the canvas or just beside it (`margin` pixels), where an arrow still helps. */
export function nearCanvas(point: Point, canvas: CanvasBox, margin = 60): boolean {
  return (
    point.x > canvas.left - margin &&
    point.x < canvas.left + canvas.width + margin &&
    point.y > canvas.top - margin &&
    point.y < canvas.top + canvas.height + margin
  );
}

/**
 * Points on the outline of the drawn pin, in the units of its SVG (viewBox 46 × 54, src/marker/index.ts): left, top and
 * right of the round head, its middle, the narrow body below and the tip. The corners of the box around the pin lie
 * well beside the head and hid a pin too early (Nutzer, 2026-11-16).
 */
const PIN_OUTLINE: readonly Point[] = [
  { x: 9, y: 18.5 },
  { x: 23, y: 4.5 },
  { x: 37, y: 18.5 },
  { x: 23, y: 18.5 },
  { x: 23, y: 35 },
  { x: 23, y: 51.5 },
];
const PIN_VIEWBOX_WIDTH = 46;

/**
 * Stage points where the pin over `anchor` (a stage point) lies, to test against the game's own buttons: points on its
 * outline, raised by half the bob, the middle of its up and down. `cssPerStage` turns the pin's CSS size into stage
 * units.
 */
export function arrowProbes(anchor: Point, scale: number, cssPerStage: number): Point[] {
  const k = scale / (cssPerStage > 0 ? cssPerStage : 1);
  const offset = arrowOffset();
  const unit = ARROW.width / PIN_VIEWBOX_WIDTH;
  return PIN_OUTLINE.map((o) => ({
    x: anchor.x + (offset.x + o.x * unit) * k,
    y: anchor.y + (offset.y + o.y * unit - ARROW.bob / 2) * k,
  }));
}
