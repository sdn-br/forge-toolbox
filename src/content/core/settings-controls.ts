import type { TemplateResult } from 'lit-html';
import type { SettingDef } from './settings';
import type { TextKey } from './texts';

/**
 * A control another feature hangs into the settings box: its group, and a section with its own heading (none: below the
 * list of the group). The box draws the controls of a place in the order they registered, after the defs of the place.
 */
export interface SettingsControl {
  group: TextKey;
  section?: TextKey;
  /** the defs this control draws itself, so the box leaves them out of the generic list */
  claims?: SettingDef[];
  render(): TemplateResult | '';
  /** drops what the control remembers, e.g. an open question; called when the box shows another group or closes */
  reset?(): void;
}

/** The places of the settings box for controls of features; lit-html stays with the controls and the box. */
export class SettingsControls {
  private controls: SettingsControl[] = [];
  private listeners = new Set<() => void>();

  add(control: SettingsControl): SettingsControl {
    this.controls.push(control);
    return control;
  }

  /** the controls of a place, in registration order */
  at(group: string, section?: TextKey): SettingsControl[] {
    return this.controls.filter((c) => c.group === group && c.section === section);
  }

  /** the sections the controls of a group name, in the order of their first control */
  sections(group: string): TextKey[] {
    const names = this.controls.filter((c) => c.group === group).map((c) => c.section);
    return [...new Set(names.filter((s) => s !== undefined))];
  }

  claimed(def: SettingDef): boolean {
    return this.controls.some((c) => c.claims?.includes(def));
  }

  reset(): void {
    for (const c of this.controls) c.reset?.();
  }

  /** a control asks for a redraw of the box, e.g. after its own state changed */
  update(): void {
    for (const listener of this.listeners) listener();
  }

  onUpdate(listener: () => void): void {
    this.listeners.add(listener);
  }
}
