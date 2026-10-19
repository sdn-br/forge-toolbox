import type { Traffic } from '../../shared/proxy-protocol';

/** Keeps raw game traffic for test fixtures. Contains private game data: saved files never go into the repo as is. */
export class Recorder {
  private traffic: Traffic[] = [];
  private listeners = new Set<() => void>();

  /** `enabled` is asked for every message, so switching the setting takes effect at once */
  constructor(private enabled: () => boolean) {}

  add(traffic: Traffic): void {
    if (!this.enabled()) return;
    this.traffic.push(traffic);
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get count(): number {
    return this.traffic.length;
  }

  save(): void {
    const blob = new Blob([JSON.stringify(this.traffic)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `forge-toolbox-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}
