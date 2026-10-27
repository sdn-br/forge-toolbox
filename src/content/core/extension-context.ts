// When the extension is reloaded or updated, content scripts in open game tabs keep running
// without it: chrome.runtime.id turns undefined and every chrome.* call throws.
let lost = false;
const listeners = new Set<() => void>();

export class ExtensionLostError extends Error {
  constructor() {
    super('extension was reloaded, reload the game');
  }
}

/** false once the extension behind this content script is gone; tells the listeners once */
export function extensionAlive(): boolean {
  if (!lost && !chrome.runtime?.id) {
    lost = true;
    for (const listener of listeners) listener();
  }
  return !lost;
}

export function assertAlive(): void {
  if (!extensionAlive()) throw new ExtensionLostError();
}

export function onExtensionLost(listener: () => void): void {
  listeners.add(listener);
}

/**
 * Checks every `everyMs` until the extension is gone. The other checks only run on game traffic or a save, and a scene
 * like the GbG map can stay quiet for minutes. Background tabs get their timers throttled, the notice then comes late.
 */
export function watchExtension(everyMs: number): void {
  const timer = setInterval(() => {
    if (!extensionAlive()) clearInterval(timer);
  }, everyMs);
}
