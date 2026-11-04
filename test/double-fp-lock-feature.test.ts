// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doubleFpLockFeature, LOCK_SECONDS } from '../src/content/features/double-fp-lock';
import { contributionRowCss } from '../src/content/features/shared/contribution-row';
import { playerId } from '../src/shared/ids';
import { featureContext } from './helpers/feature-context';

const foreign = { owner: playerId(222), entityId: 14, own: false };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  for (const el of document.querySelectorAll('[data-forge-toolbox="double-fp-lock"]')) el.remove();
});

function setup() {
  const env = featureContext();
  const { ctx } = env;
  doubleFpLockFeature.setup(ctx);
  const root = () => document.querySelector('[data-forge-toolbox="double-fp-lock"]')?.shadowRoot;
  const bar = () => root()?.querySelector('.lock') ?? null;
  const contribute = (e = foreign) => ctx.bus.emit('greatBuilding.contributing', e);
  return { ...env, root, bar, contribute };
}

describe('double FP lock', () => {
  it('covers the contribution row as soon as a contribution to a foreign building leaves', () => {
    const { bar, contribute } = setup();
    expect(bar()).toBeNull();
    contribute();
    expect(bar()?.textContent).toContain('Eingezahlt, kurz gesperrt');
    expect(bar()?.getAttribute('role')).toBe('status');
  });

  it('shows nothing for an own building', () => {
    const { bar, contribute } = setup();
    contribute({ ...foreign, own: true });
    expect(bar()).toBeNull();
  });

  it('goes after the set seconds, not before', () => {
    const { bar, contribute } = setup();
    contribute();
    vi.advanceTimersByTime(1999);
    expect(bar()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(bar()).toBeNull();
  });

  it('runs the bar down over the set seconds', async () => {
    const { ctx, root, contribute } = setup();
    await ctx.settings.of(LOCK_SECONDS).set(5);
    contribute();
    expect(root()?.querySelector('.run')?.getAttribute('style')).toContain('5s');
  });

  it('does nothing when set to 0', async () => {
    const { ctx, bar, contribute } = setup();
    await ctx.settings.of(LOCK_SECONDS).set(0);
    contribute();
    expect(bar()).toBeNull();
  });

  it('restarts the timer and the bar with a new contribution while locked', () => {
    const { root, bar, contribute } = setup();
    contribute();
    const first = root()?.querySelector('.run');
    vi.advanceTimersByTime(1500);
    contribute();
    expect(root()?.querySelector('.run')).not.toBe(first);
    vi.advanceTimersByTime(1500);
    expect(bar()).not.toBeNull();
    vi.advanceTimersByTime(500);
    expect(bar()).toBeNull();
  });

  it('goes when the game window turns away from a foreign building', () => {
    const { ctx, bar, contribute } = setup();
    contribute();
    ctx.bus.emit('gbWindow.changed', { state: 'foreign' });
    expect(bar()).not.toBeNull();
    ctx.bus.emit('gbWindow.changed', { state: 'list' });
    expect(bar()).toBeNull();
  });

  it('lies above the contribution warning', () => {
    const { root, contribute } = setup();
    contribute();
    const z = Number(/\.lock \{ z-index:\s*(\d+)/.exec(root()?.querySelector('style')?.textContent ?? '')?.[1]);
    expect(z).toBeGreaterThan(2147479000);
  });

  it('sits where the contribution warning sits', () => {
    const { root, contribute } = setup();
    contribute();
    expect(root()?.querySelector('style')?.textContent).toContain(contributionRowCss);
  });
});
