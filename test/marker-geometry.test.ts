import { describe, expect, it } from 'vitest';
import {
  ARROW,
  anchorOf,
  arrowOffset,
  arrowScale,
  cssPerStage,
  nearCanvas,
  sceneStep,
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
});

describe('scene binding', () => {
  const a = { name: 'a' };
  const b = { name: 'b' };

  it('binds to the first city scene and keeps it', () => {
    expect(sceneStep(undefined, a, false)).toBe('bind');
    expect(sceneStep(a, a, false)).toBe('keep');
  });

  it('waits while the game shows no city scene', () => {
    expect(sceneStep(undefined, undefined, false)).toBe('keep');
    expect(sceneStep(a, undefined, false)).toBe('keep');
  });

  it('drops the arrows when another city scene shows, unless they still settle after a city change', () => {
    expect(sceneStep(a, b, false)).toBe('drop');
    expect(sceneStep(a, b, true)).toBe('bind');
  });
});
