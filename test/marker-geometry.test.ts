import { describe, expect, it } from 'vitest';
import {
  ARROW,
  anchorOf,
  arrowOffset,
  arrowProbes,
  arrowScale,
  cssPerStage,
  nearCanvas,
  stageToViewport,
} from '../src/marker/geometry';

const canvas = { left: 10, top: 20, width: 800, height: 600 };

describe('marker geometry', () => {
  it('points at the middle of the footprint, width along x and length along y', () => {
    expect(anchorOf({ x: 4, y: 6, width: 3, length: 2 })).toEqual({ x: 5.5, y: 7 });
  });

  it('maps stage points to viewport pixels, scaled when the stage runs in device pixels', () => {
    expect(cssPerStage(canvas, 800)).toBe(1);
    expect(cssPerStage(canvas, 1600)).toBe(0.5);
    expect(cssPerStage(canvas, undefined)).toBe(1);
    expect(cssPerStage(canvas, 0)).toBe(1);
    expect(stageToViewport({ x: 100, y: 50 }, canvas, 0.5)).toEqual({ x: 60, y: 45 });
  });

  it('follows the zoom within limits', () => {
    expect(arrowScale(0.8)).toBe(0.8);
    expect(arrowScale(0.1)).toBe(0.5);
    expect(arrowScale(4)).toBe(1.5);
    expect(arrowScale('x')).toBe(1);
  });

  it('draws the arrow 92 × 108 centered above the anchor, its tip 14 pixels above it', () => {
    expect(ARROW).toMatchObject({ width: 92, height: 108, gap: 14, bob: 20 });
    const offset = arrowOffset();
    expect(offset.x + ARROW.width / 2).toBe(0);
    expect(offset.y + ARROW.height).toBe(-14);
  });

  it('shows arrows on the canvas and just beside it', () => {
    expect(nearCanvas({ x: 400, y: 300 }, canvas)).toBe(true);
    expect(nearCanvas({ x: -40, y: 300 }, canvas)).toBe(true);
    expect(nearCanvas({ x: -60, y: 300 }, canvas)).toBe(false);
    expect(nearCanvas({ x: 400, y: 700 }, canvas)).toBe(false);
  });

  it('probes the corners and the middle of the arrow, raised by the bob, and its tip, in stage units', () => {
    // at scale 1 and one CSS pixel per stage unit: 92 wide, top at 14 + 108 + 20 above the anchor, tip 14 above
    expect(arrowProbes({ x: 100, y: 200 }, 1, 1)).toEqual([
      { x: 54, y: 58 },
      { x: 146, y: 58 },
      { x: 54, y: 186 },
      { x: 146, y: 186 },
      { x: 100, y: 122 },
      { x: 100, y: 186 },
    ]);
    // twice the zoom on a stage in device pixels (two CSS pixels per stage unit) cancels out
    expect(arrowProbes({ x: 100, y: 200 }, 2, 2)).toEqual(arrowProbes({ x: 100, y: 200 }, 1, 1));
  });
});
