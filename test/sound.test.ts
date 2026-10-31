import { describe, expect, it, vi } from 'vitest';
import { createChime } from '../src/content/ui/sound';

describe('createChime', () => {
  it('rings once per new key and stays silent for the same key as last time', () => {
    const tone = vi.fn();
    const chime = createChime(tone);
    chime.ring('a');
    chime.ring('a');
    chime.ring('b');
    chime.ring('a');
    expect(tone).toHaveBeenCalledTimes(3);
  });

  it('remembers a key rung silently, and forgets it on reset', () => {
    const tone = vi.fn();
    const chime = createChime(tone);
    chime.ring('a', false);
    chime.ring('a');
    expect(tone).not.toHaveBeenCalled();
    chime.reset();
    chime.ring('a');
    expect(tone).toHaveBeenCalledTimes(1);
  });
});
