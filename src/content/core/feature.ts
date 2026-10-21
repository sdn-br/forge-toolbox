import type { WorldId } from '../../shared/ids';
import type { BattleStore } from '../stores/battles';
import type { CatalogStore } from '../stores/catalog';
import type { CityStore } from '../stores/cities';
import type { IncomingStore } from '../stores/incoming';
import type { NoteStore } from '../stores/notes';
import type { PlayerStore } from '../stores/players';
import type { PlunderStore } from '../stores/plunders';
import type { ResearchStore } from '../stores/research';
import type { ResourceStore } from '../stores/resources';
import type { SessionStore } from '../stores/session';
import type { ShieldStore } from '../stores/shields';
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
  resources: ResourceStore;
  research: ResearchStore;
  battles: BattleStore;
  plunders: PlunderStore;
  incoming: IncomingStore;
  shields: ShieldStore;
  notes: NoteStore;
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
