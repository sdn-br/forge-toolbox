// Grid ↔ screen for the city map. Pure, so the hover hit test can be checked without a canvas.
import type { Bounds, TileRect } from '../domain/city-grid';

/**
 * `top`: x to the right, y down, a tile is a square.
 * `iso`: as the game shows the city, the grid turned by 45° and squashed to half height, a tile is a diamond
 * twice as wide as high. Grid x runs to the lower right, grid y to the lower left.
 */
export type MapMode = 'top' | 'iso';

/** a remembered mode; anything else is the view from above */
export const toMode = (value: string | undefined): MapMode => (value === 'iso' ? 'iso' : 'top');

export interface Point {
  x: number;
  y: number;
}

/** Zoom 1 shows the whole grid; pan moves it in screen pixels. */
export interface MapView {
  zoom: number;
  panX: number;
  panY: number;
}

export const WHOLE_MAP: MapView = { zoom: 1, panX: 0, panY: 0 };
const MAX_ZOOM = 12;

/** Grid point (tile corners at whole numbers) → plane of the mode, one tile wide. */
export function toPlane(mode: MapMode, gx: number, gy: number): Point {
  return mode === 'top' ? { x: gx, y: gy } : { x: (gx - gy) / 2, y: (gx + gy) / 4 };
}

export function fromPlane(mode: MapMode, px: number, py: number): Point {
  return mode === 'top' ? { x: px, y: py } : { x: px + 2 * py, y: 2 * py - px };
}

/** The four corners of a rectangle of tiles in grid order: top left, top right, bottom right, bottom left. */
export const corners = (r: TileRect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.length },
  { x: r.x, y: r.y + r.length },
];

export interface Projection {
  mode: MapMode;
  /** screen pixels per plane unit */
  scale: number;
  originX: number;
  originY: number;
}

/** The smallest box around a rectangle of tiles in the plane of the mode. */
function planeBox(mode: MapMode, r: TileRect) {
  const plane = corners(r).map((c) => toPlane(mode, c.x, c.y));
  const minX = Math.min(...plane.map((p) => p.x));
  const minY = Math.min(...plane.map((p) => p.y));
  const maxX = Math.max(...plane.map((p) => p.x));
  const maxY = Math.max(...plane.map((p) => p.y));
  return { minX, minY, maxX, maxY };
}

/** Fits the bounds into a box of `width` × `height` pixels, centered, then applies zoom and pan. */
export function project(mode: MapMode, bounds: Bounds, width: number, height: number, view: MapView): Projection {
  const rect = { x: bounds.x1, y: bounds.y1, width: bounds.x2 - bounds.x1 + 1, length: bounds.y2 - bounds.y1 + 1 };
  const { minX, minY, maxX, maxY } = planeBox(mode, rect);
  const scale = Math.min(width / (maxX - minX), height / (maxY - minY)) * view.zoom;
  return {
    mode,
    scale,
    originX: (width - (maxX - minX) * scale) / 2 - minX * scale + view.panX,
    originY: (height - (maxY - minY) * scale) / 2 - minY * scale + view.panY,
  };
}

export function toScreen(p: Projection, gx: number, gy: number): Point {
  const plane = toPlane(p.mode, gx, gy);
  return { x: p.originX + plane.x * p.scale, y: p.originY + plane.y * p.scale };
}

/** The tile under a screen point. */
export function tileAt(p: Projection, sx: number, sy: number): Point {
  const grid = fromPlane(p.mode, (sx - p.originX) / p.scale, (sy - p.originY) / p.scale);
  return { x: Math.floor(grid.x), y: Math.floor(grid.y) };
}

/** Zooms by `factor` and keeps the grid point under the screen point where it is. Zoom 1 drops the pan. */
export function zoomAt(
  mode: MapMode,
  bounds: Bounds,
  width: number,
  height: number,
  view: MapView,
  factor: number,
  sx: number,
  sy: number,
): MapView {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom * factor));
  if (zoom === 1) return WHOLE_MAP;
  const before = project(mode, bounds, width, height, view);
  const plane = { x: (sx - before.originX) / before.scale, y: (sy - before.originY) / before.scale };
  const after = project(mode, bounds, width, height, { zoom, panX: 0, panY: 0 });
  return {
    zoom,
    panX: sx - plane.x * after.scale - after.originX,
    panY: sy - plane.y * after.scale - after.originY,
  };
}

/** Draw order: in the isometric view from back to front, so whatever stands in front is drawn last. */
export function backToFront<T extends TileRect>(mode: MapMode, rects: T[]): T[] {
  if (mode === 'top') return rects;
  return [...rects].sort((a, b) => a.x + a.width + a.y + a.length - (b.x + b.width + b.y + b.length));
}

/**
 * Puts the middle of `rect` into the middle of the screen. Keeps the zoom, unless the building would show narrower
 * than `minSize` pixels; then it zooms in until it is that wide (or as far as the zoom goes).
 */
export function centerOn(
  mode: MapMode,
  bounds: Bounds,
  width: number,
  height: number,
  view: MapView,
  rect: TileRect,
  minSize: number,
): MapView {
  const box = planeBox(mode, rect);
  const extent = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  const whole = project(mode, bounds, width, height, WHOLE_MAP);
  const needed = extent > 0 ? minSize / (extent * whole.scale) : 1;
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom, needed));
  const base = project(mode, bounds, width, height, { zoom, panX: 0, panY: 0 });
  const middle = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  return {
    zoom,
    panX: width / 2 - base.originX - middle.x * base.scale,
    panY: height / 2 - base.originY - middle.y * base.scale,
  };
}

/** The other mode at the same zoom, with the grid point in the middle of the view still in the middle. Zoom 1 drops the pan. */
export function switchMode(
  from: MapMode,
  to: MapMode,
  bounds: Bounds,
  width: number,
  height: number,
  view: MapView,
): MapView {
  if (view.zoom <= 1) return WHOLE_MAP;
  const old = project(from, bounds, width, height, view);
  const middle = fromPlane(from, (width / 2 - old.originX) / old.scale, (height / 2 - old.originY) / old.scale);
  const base = project(to, bounds, width, height, { zoom: view.zoom, panX: 0, panY: 0 });
  const plane = toPlane(to, middle.x, middle.y);
  return {
    zoom: view.zoom,
    panX: width / 2 - base.originX - plane.x * base.scale,
    panY: height / 2 - base.originY - plane.y * base.scale,
  };
}
