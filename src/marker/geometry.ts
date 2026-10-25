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

/** The four grid corners of a footprint, around it in order. */
export function cornersOf(rect: GridRect): Point[] {
  const { x, y, width, length } = rect;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + length },
    { x, y: y + length },
  ];
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
 * Whether `p` lies inside the convex quad `quad` (its corners around it in either direction). On the edge counts as
 * inside. A degenerate quad contains nothing.
 */
export function inQuad(p: Point, quad: Point[]): boolean {
  if (quad.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i] as Point;
    const b = quad[(i + 1) % 4] as Point;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** A pointer that went down and up within this many pixels is a click, not a drag of the game view. */
export const CLICK_SLOP = 6;

export const isClick = (down: Point, up: Point) => Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_SLOP;

/**
 * What to do with arrows bound to `bound` when the game shows `current`:
 * - `bind`: no scene bound yet, or the game switched while the arrows still settle; take `current`.
 * - `keep`: the same scene, or no city scene at all right now (a battle, the map); the arrows wait, hidden.
 * - `drop`: the game shows another city scene; the arrows belonged to the old one.
 */
export function sceneStep<S>(
  bound: S | undefined,
  current: S | undefined,
  settling: boolean,
): 'bind' | 'keep' | 'drop' {
  if (current === undefined || current === bound) return 'keep';
  if (bound === undefined || settling) return 'bind';
  return 'drop';
}
