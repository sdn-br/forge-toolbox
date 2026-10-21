import type { WorldId } from '../../shared/ids';
import type { Stores } from '../stores';
import { Box, type BoxOptions } from '../ui/box';
import type { Menu } from '../ui/menu';
import type { UiState } from '../ui/ui-state';
import type { ToolboxBus } from './events';
import type { Recorder } from './recorder';
import type { Settings } from './settings';

/** Everything a feature may use. Features never import each other. */
export interface FeatureContext extends Stores {
  world: WorldId;
  bus: ToolboxBus;
  settings: Settings;
  menu: Menu;
  recorder: Recorder;
  /** remembered view choices of the viewer */
  ui: UiState;
  createBox(options: BoxOptions): Box;
}

export interface Feature {
  id: string;
  setup(ctx: FeatureContext): void;
}

export function boxFactory(ui: UiState): (options: BoxOptions) => Box {
  return (options) => new Box(options, ui);
}
