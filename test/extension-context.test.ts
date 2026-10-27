import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertAlive,
  ExtensionLostError,
  extensionAlive,
  onExtensionLost,
} from '../src/content/core/extension-context';

describe('extension context', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('notices once that the extension is gone and refuses further calls', () => {
    const runtime: { id?: string } = { id: 'abc' };
    vi.stubGlobal('chrome', { runtime });
    let notified = 0;
    onExtensionLost(() => notified++);
    expect(extensionAlive()).toBe(true);
    delete runtime.id;
    expect(extensionAlive()).toBe(false);
    expect(extensionAlive()).toBe(false);
    expect(() => assertAlive()).toThrow(ExtensionLostError);
    expect(notified).toBe(1);
  });

  it('watches for the loss without any call, so the notice shows in every scene', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const context = await import('../src/content/core/extension-context');
    const runtime: { id?: string } = { id: 'abc' };
    vi.stubGlobal('chrome', { runtime });
    let notified = 0;
    context.onExtensionLost(() => notified++);
    context.watchExtension(2_000);

    delete runtime.id;
    vi.advanceTimersByTime(1_999);
    expect(notified).toBe(0);
    vi.advanceTimersByTime(1);
    expect(notified).toBe(1);
    // stops once lost
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
