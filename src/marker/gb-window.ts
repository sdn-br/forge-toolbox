// Reads which great building window the game shows. The class names are minified, so the windows are found by their
// fields.
//
// debt: relies on undocumented internals of the game engine (`windowContainer`, a list window with
// `gbOverviewItemData`, `ownerVO` and `_playerId`, a great building window with `_entity`, `_bonusModel` and
// `_isOwnBuilding`, seen 2026-10-28). Ceiling: a game update can rename them; then the state stays `none`, nothing is
// reported, and the boxes open, fold and stay open as they did before. Upgrade: fix the lookup against the new engine
// when the boxes stop following the game windows.
import type { GbWindowState } from '../shared/gb-window-protocol';

interface EngineNode {
  __children?: EngineNode[];
  __visible?: unknown;
  windowContainer?: EngineNode;
  gbOverviewItemData?: unknown;
  ownerVO?: unknown;
  _playerId?: unknown;
  _entity?: unknown;
  _bonusModel?: unknown;
  _isOwnBuilding?: unknown;
}

const isList = (w: EngineNode) => 'gbOverviewItemData' in w && 'ownerVO' in w && '_playerId' in w;
const isGreatBuilding = (w: EngineNode) =>
  '_entity' in w && '_bonusModel' in w && typeof w._isOwnBuilding === 'boolean';

/** the great building window the game shows; one over a list counts, and a foreign one before an own one */
export function gbWindow(stage: EngineNode | undefined): GbWindowState {
  let state: GbWindowState = 'none';
  for (const child of stage?.__children ?? []) {
    for (const w of child?.windowContainer?.__children ?? []) {
      if (typeof w !== 'object' || w === null || w.__visible === false) continue;
      if (isGreatBuilding(w)) {
        if (w._isOwnBuilding === false) return 'foreign';
        state = 'own';
      } else if (isList(w) && state === 'none') state = 'list';
    }
  }
  return state;
}
