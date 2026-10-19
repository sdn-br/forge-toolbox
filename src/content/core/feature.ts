import type { WorldId } from '../../shared/ids';
import type { CatalogStore } from '../stores/catalog';
import type { CityStore } from '../stores/cities';
import type { PlayerStore } from '../stores/players';
import type { SessionStore } from '../stores/session';
import { Box, type BoxOptions } from '../ui/box';
import type { Menu } from '../ui/menu';
import type { UiState } from '../ui/ui-state';
import type { ToolboxBus } from './events';
import type { Recorder } from './recorder';
import type { Settings } from './settings';

/** Everything a feature may use. Features never import each other. */
export interface FeatureContext {
  world: WorldId;
  bus: ToolboxBus;
  settings: Settings;
  menu: Menu;
  session: SessionStore;
  players: PlayerStore;
  cities: CityStore;
  catalog: CatalogStore;
  recorder: Recorder;
  createBox(options: BoxOptions): Box;
}

export interface Feature {
  id: string;
  setup(ctx: FeatureContext): void;
}

export function boxFactory(ui: UiState): (options: BoxOptions) => Box {
  return (options) => new Box(options, ui);
}
