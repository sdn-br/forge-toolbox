import type { KeyValue } from '../core/kv';
import { logError } from '../core/log';

export interface BoxState {
  x?: number;
  y?: number;
  pinned?: boolean;
  minimized?: boolean;
  /** size set by the viewer, in pixels; without it the box has its default width and the height of its content */
  width?: number;
  height?: number;
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

  removePref(key: string): void {
    if (!(key in this.prefs)) return;
    const { [key]: _, ...rest } = this.prefs;
    this.prefs = rest;
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
