import { describe, expect, it, vi } from 'vitest';
import { createShell } from '../src/content/core/shell';

type Boxes = { plain: []; grouped: [group: string] };

describe('shell', () => {
  it('opens the box its feature registered, with the arguments given', () => {
    const shell = createShell<Boxes>();
    const plain = vi.fn();
    const grouped = vi.fn();
    shell.registerOpen('plain', plain);
    shell.registerOpen('grouped', grouped);
    shell.open('grouped', 'gbOwn.title');
    expect(grouped).toHaveBeenCalledWith('gbOwn.title');
    expect(plain).not.toHaveBeenCalled();
    shell.open('plain');
    expect(plain).toHaveBeenCalledTimes(1);
  });

  it('logs a box nobody registered instead of passing over it silently', () => {
    const shell = createShell<Boxes>();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    shell.open('plain');
    expect(error).toHaveBeenCalledWith('[Forge Toolbox]', 'no box registered to open for plain', undefined);
    error.mockRestore();
  });

  it('refuses a second receiver for the same box', () => {
    const shell = createShell<Boxes>();
    shell.registerOpen('plain', () => {});
    expect(() => shell.registerOpen('plain', () => {})).toThrow('plain');
  });
});
