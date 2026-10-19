import type { KeyValue } from '../core/kv';

export interface BoxState {
  x?: number;
  y?: number;
  pinned?: boolean;
  minimized?: boolean;
}

/** Remembers position and flags of each box across page loads. */
export class UiState {
  private boxes: Record<string, BoxState> = {};

  constructor(private kv: KeyValue) {}

  async load(): Promise<void> {
    this.boxes = (await this.kv.get<Record<string, BoxState>>('ui.boxes')) ?? {};
  }

  box(id: string): BoxState {
    return this.boxes[id] ?? {};
  }

  saveBox(id: string, patch: BoxState): void {
    this.boxes = { ...this.boxes, [id]: { ...this.box(id), ...patch } };
    void this.kv.set('ui.boxes', this.boxes);
  }
}
