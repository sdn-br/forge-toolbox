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
});
