import { describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import { viewFlag } from '../src/content/features/shared/gb-own-view';
import { UiState } from '../src/content/ui/ui-state';

describe('the view helpers of the own-share boxes', () => {
  it('reads the view switches with a fallback', () => {
    const ui = new UiState(memoryKv());
    expect(viewFlag(ui, 'gbOwn.secure', true)).toBe(true);
    ui.savePref('gbOwn.secure', 'false');
    expect(viewFlag(ui, 'gbOwn.secure', true)).toBe(false);
  });
});
