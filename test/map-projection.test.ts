import { describe, expect, it } from 'vitest';
import {
  backToFront,
  centerOn,
  fromPlane,
  type MapMode,
  project,
  switchMode,
  tileAt,
  toPlane,
  toScreen,
  WHOLE_MAP,
  zoomAt,
} from '../src/content/ui/map-projection';

const bounds = { x1: 0, y1: 0, x2: 9, y2: 9 };

describe('map projection', () => {
  it('shows a tile as a square from above', () => {
    const p = project('top', bounds, 200, 100, WHOLE_MAP);
    // 10 tiles into 100 pixels height: 10 px per tile, centered horizontally
    expect(p.scale).toBe(10);
    expect(toScreen(p, 0, 0)).toEqual({ x: 50, y: 0 });
    expect(toScreen(p, 10, 10)).toEqual({ x: 150, y: 100 });
  });

  it('shows a tile as a diamond twice as wide as high in the isometric view', () => {
    const top = toPlane('iso', 0, 0);
    const right = toPlane('iso', 1, 0);
    const bottom = toPlane('iso', 1, 1);
    const left = toPlane('iso', 0, 1);
    expect(right.x - left.x).toBe(1);
    expect(bottom.y - top.y).toBe(0.5);
    expect(top.x).toBe(bottom.x);
    expect(right.y).toBe(left.y);
  });

  it('puts the corner at the top of the screen in the isometric view', () => {
    const p = project('iso', bounds, 200, 100, WHOLE_MAP);
    expect(toScreen(p, 0, 0)).toEqual({ x: 100, y: 0 });
    expect(toScreen(p, 10, 10).y).toBeCloseTo(100);
  });

  it.each<MapMode>(['top', 'iso'])('turns plane points back into grid points (%s)', (mode) => {
    for (const [x, y] of [
      [0, 0],
      [3.5, -2],
      [12, 7.25],
    ] as const) {
      const plane = toPlane(mode, x, y);
      const grid = fromPlane(mode, plane.x, plane.y);
      expect(grid.x).toBeCloseTo(x);
      expect(grid.y).toBeCloseTo(y);
    }
  });

  it.each<MapMode>(['top', 'iso'])('finds the tile under the center of each tile (%s)', (mode) => {
    const p = project(mode, bounds, 300, 200, { zoom: 2.5, panX: 13, panY: -7 });
    for (const [x, y] of [
      [0, 0],
      [9, 0],
      [0, 9],
      [4, 6],
    ] as const) {
      const center = toScreen(p, x + 0.5, y + 0.5);
      expect(tileAt(p, center.x, center.y)).toEqual({ x, y });
    }
  });

  it.each<MapMode>(['top', 'iso'])('keeps the tile under the pointer when zooming (%s)', (mode) => {
    const view = zoomAt(mode, bounds, 300, 200, WHOLE_MAP, 2, 120, 80);
    expect(view.zoom).toBe(2);
    const before = tileAt(project(mode, bounds, 300, 200, WHOLE_MAP), 120, 80);
    expect(tileAt(project(mode, bounds, 300, 200, view), 120, 80)).toEqual(before);
  });

  it('zooms no further out than the whole map and drops the pan there', () => {
    expect(zoomAt('top', bounds, 300, 200, { zoom: 1.1, panX: 20, panY: 5 }, 0.5, 0, 0)).toEqual(WHOLE_MAP);
  });

  it('draws the isometric view from back to front', () => {
    const front = { x: 5, y: 5, width: 1, length: 1 };
    const back = { x: 0, y: 0, width: 2, length: 2 };
    const middle = { x: 4, y: 0, width: 1, length: 1 };
    expect(backToFront('iso', [front, back, middle])).toEqual([back, middle, front]);
    expect(backToFront('top', [front, back, middle])).toEqual([front, back, middle]);
  });

  const middleOf = (mode: MapMode, view: Parameters<typeof project>[4], r: { x: number; y: number }) =>
    toScreen(project(mode, bounds, 300, 200, view), r.x, r.y);

  it.each<MapMode>(['top', 'iso'])(
    'centers a building in the view and keeps the zoom when it is big enough (%s)',
    (mode) => {
      const rect = { x: 7, y: 2, width: 3, length: 2 };
      const view = centerOn(mode, bounds, 300, 200, { zoom: 2, panX: 40, panY: -10 }, rect, 20);
      expect(view.zoom).toBe(2);
      const middle = middleOf(mode, view, { x: 8.5, y: 3 });
      expect(middle.x).toBeCloseTo(150);
      expect(middle.y).toBeCloseTo(100);
    },
  );

  it.each<MapMode>(['top', 'iso'])('zooms in until a small building is wide enough (%s)', (mode) => {
    const rect = { x: 1, y: 8, width: 1, length: 1 };
    const view = centerOn(mode, bounds, 300, 200, WHOLE_MAP, rect, 40);
    const p = project(mode, bounds, 300, 200, view);
    const left = toScreen(p, 1, 9);
    const right = toScreen(p, 2, 8);
    // from above the tile is a square, isometric a diamond with its left and right corner on one line
    expect(Math.max(right.x - left.x, toScreen(p, 2, 9).x - toScreen(p, 1, 8).x)).toBeCloseTo(40);
    const middle = toScreen(p, 1.5, 8.5);
    expect(middle.x).toBeCloseTo(150);
    expect(middle.y).toBeCloseTo(100);
  });

  it('zooms no further in than the largest zoom', () => {
    expect(centerOn('top', bounds, 300, 200, WHOLE_MAP, { x: 0, y: 0, width: 1, length: 1 }, 10_000).zoom).toBe(12);
  });

  it.each<[MapMode, MapMode]>([
    ['top', 'iso'],
    ['iso', 'top'],
  ])('keeps the zoom and the middle of the view when switching from %s to %s', (from, to) => {
    const view = zoomAt(from, bounds, 300, 200, WHOLE_MAP, 3, 100, 60);
    const before = project(from, bounds, 300, 200, view);
    const grid = fromPlane(from, (150 - before.originX) / before.scale, (100 - before.originY) / before.scale);
    const switched = switchMode(from, to, bounds, 300, 200, view);
    expect(switched.zoom).toBe(view.zoom);
    const middle = toScreen(project(to, bounds, 300, 200, switched), grid.x, grid.y);
    expect(middle.x).toBeCloseTo(150);
    expect(middle.y).toBeCloseTo(100);
  });

  it('shows the whole map after switching when not zoomed in', () => {
    expect(switchMode('top', 'iso', bounds, 300, 200, WHOLE_MAP)).toEqual(WHOLE_MAP);
  });
});
