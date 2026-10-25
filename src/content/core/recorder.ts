import type { Traffic } from '../../shared/proxy-protocol';

/**
 * Keeps raw game traffic for test fixtures. Contains private game data: saved files never go into the repo as is.
 * The websocket login carries the session token in plain text, it is kept with the token masked.
 */
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
    if (traffic.kind === 'ws' && traffic.direction === 'out' && traffic.data.includes('"authWithToken"')) {
      traffic = { ...traffic, data: maskToken(traffic.data) };
    }
    if (!this.withRequests()) {
      if (traffic.kind === 'ws' && traffic.direction === 'out') return;
      if (traffic.kind === 'json') traffic = { ...traffic, request: null };
    }
    this.traffic.push(traffic);
    this.changed();
  }

  /** drops what was kept, so a recording of one action stays small */
  clear(): void {
    this.traffic = [];
    this.changed();
  }

  private changed(): void {
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

function maskToken(data: string): string {
  try {
    return JSON.stringify({ ...JSON.parse(data), requestData: ['*****'] });
  } catch {
    return '*****';
  }
}
