import type { KeyValue } from '../core/kv';
import { logError } from '../core/log';

export interface BoxState {
  x?: number;
  y?: number;
  pinned?: boolean;
  minimized?: boolean;
}

/** Remembers position and flags of each box, and small view choices of features, across page loads. */
export class UiState {
  private boxes: Record<string, BoxState> = {};
  private prefs: Record<string, string> = {};

  constructor(private kv: KeyValue) {}

  async load(): Promise<void> {
    this.boxes = (await this.kv.get<Record<string, BoxState>>('ui.boxes')) ?? {};
    this.prefs = (await this.kv.get<Record<string, string>>('ui.prefs')) ?? {};
  }

  /** a view choice such as the mode of a map; not a setting, so it does not show in the settings box */
  pref(key: string): string | undefined {
    return this.prefs[key];
  }

  savePref(key: string, value: string): void {
    this.prefs = { ...this.prefs, [key]: value };
    this.kv.set('ui.prefs', this.prefs).catch((error) => logError('saving a view choice failed', error));
  }

  box(id: string): BoxState {
    return this.boxes[id] ?? {};
  }

  saveBox(id: string, patch: BoxState): void {
    this.boxes = { ...this.boxes, [id]: { ...this.box(id), ...patch } };
    this.kv.set('ui.boxes', this.boxes).catch((error) => logError('saving box state failed', error));
  }
}
