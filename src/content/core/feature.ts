import type { WorldId } from '../../shared/ids';
import type { Stores } from '../stores';
import type { GbOwnState } from '../stores/gb-own-state';
import { Box, type BoxOptions } from '../ui/box';
import type { Menu } from '../ui/menu';
import type { UiState } from '../ui/ui-state';
import type { ToolboxBus } from './events';
import type { Markers } from './markers';
import type { Recorder } from './recorder';
import type { OwnSelection } from './selection';
import type { Settings } from './settings';

/** Everything a feature may use. Features never import each other. */
export interface FeatureContext extends Stores {
  world: WorldId;
  bus: ToolboxBus;
  settings: Settings;
  menu: Menu;
  recorder: Recorder;
  /** arrows over buildings in the game view */
  markers: Markers;
  /** the selected buildings of the own city, shown in the boxes and with arrows in the game */
  selection: OwnSelection;
  /** remembered view choices of the viewer */
  ui: UiState;
  /** the factors and Ext the two own-share boxes share */
  gbOwn: GbOwnState;
  createBox(options: BoxOptions): Box;
}

export interface Feature {
  id: string;
  setup(ctx: FeatureContext): void;
}

/** `openSettings` backs the settings button of boxes that name a settings group */
export function boxFactory(ui: UiState, openSettings?: (group: string) => void): (options: BoxOptions) => Box {
  return (options) => new Box(options, ui, openSettings);
}
