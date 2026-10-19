import type { Traffic } from '../../shared/proxy-protocol';

/** Keeps raw game traffic for test fixtures. Contains private game data: saved files never go into the repo as is. */
export class Recorder {
  private traffic: Traffic[] = [];

  add(traffic: Traffic): void {
    this.traffic.push(traffic);
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
