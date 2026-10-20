import type { Traffic } from '../../shared/proxy-protocol';

/** Keeps raw game traffic for test fixtures. Contains private game data: saved files never go into the repo as is. */
export class Recorder {
  private traffic: Traffic[] = [];
  private listeners = new Set<() => void>();

  /** both settings are asked for every message, so switching them takes effect at once */
  constructor(
    private enabled: () => boolean,
    private withRequests: () => boolean = () => false,
  ) {}

  add(traffic: Traffic): void {
    if (!this.enabled()) return;
    if (!this.withRequests()) {
      if (traffic.kind === 'ws' && traffic.direction === 'out') return;
      if (traffic.kind === 'json') traffic = { ...traffic, request: null };
    }
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

  serialize(): string {
    return JSON.stringify(this.traffic);
  }

  save(): void {
    const blob = new Blob([this.serialize()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `forge-toolbox-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}
