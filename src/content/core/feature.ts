import type { WorldId } from '../../shared/ids';
import type { FoundData } from '../backup/found-data';
import type { Stores } from '../stores';
import type { OwnSelection } from '../stores/selection';
import { Box, type BoxOptions } from '../ui/box';
import type { Menu } from '../ui/menu';
import type { UiState } from '../ui/ui-state';
import type { ToolboxBus } from './events';
import type { Markers } from './markers';
import type { ProfileCopy } from './profile-copy';
import type { Recorder } from './recorder';
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
  createBox(options: BoxOptions): Box;
  /** the other profiles, to take over their settings */
  profileCopy: ProfileCopy;
  /** the data of the profile found on the game page: the backup copy and the old toolbox data */
  foundData: FoundData;
}

export interface Feature {
  id: string;
  setup(ctx: FeatureContext): void;
}

/** `openSettings` backs the settings button of boxes that name a settings group */
export function boxFactory(ui: UiState, openSettings?: (group: string) => void): (options: BoxOptions) => Box {
  return (options) => new Box(options, ui, openSettings);
}
