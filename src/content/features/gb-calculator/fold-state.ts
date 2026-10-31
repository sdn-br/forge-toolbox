// Which part of the box is folded: the section "Mögliche Einzahlungen" (snipe list) above, the calculator below. Rules in
// docs/features/lg-rechner.md and docs/features/snipehilfe.md.
import type { GbWindowState } from '../../../shared/gb-window-protocol';

export interface FoldState {
  /** the section "Mögliche Einzahlungen" is unfolded */
  snipeExpanded: boolean;
  /** the calculator is folded to one line */
  calcFolded: boolean;
  /** the GB window the game shows by the last gbWindow.changed; stays 'none' when the engine is not found */
  window: GbWindowState;
}

/** what each section shows now, for the events that depend on it */
export interface FoldContent {
  /** the snipe section has a list */
  hasList: boolean;
  /** the calculator shows a building */
  hasBuilding: boolean;
}

export type FoldEvent =
  /** a new list of another player that the player asked for */
  | { type: 'listArrived' }
  /** the calculator follows a foreign building just opened; `ofListOwner` when it belongs to the owner of the list */
  | { type: 'buildingOpened'; ofListOwner: boolean }
  /** the window the game shows changed */
  | ({ type: 'window'; state: GbWindowState } & FoldContent)
  /** a click on the fold line of the calculator */
  | { type: 'toggleCalc' }
  /** a click on the fold line of the snipe section */
  | { type: 'toggleSnipe' };

export const initialFold: FoldState = { snipeExpanded: false, calcFolded: false, window: 'none' };

/**
 * The fold rules: a new list unfolds its section and folds the calculator; a foreign building unfolds the calculator
 * and folds the section unless it belongs to the list's owner and the game does not show its window; the window the
 * game shows wins (the list unfolds its section, a foreign building the calculator); one part stays open, so folding
 * the last open part unfolds the other.
 */
export function foldReducer(state: FoldState, event: FoldEvent): FoldState {
  switch (event.type) {
    case 'listArrived':
      return { ...state, snipeExpanded: true, calcFolded: true };
    case 'buildingOpened':
      // a building of the list's owner keeps the list open, it is what the player is going through, unless the game
      // shows the building's window: it comes before the building, so the window signal could not fold yet
      return {
        ...state,
        snipeExpanded: event.ofListOwner && state.window !== 'foreign' ? state.snipeExpanded : false,
        calcFolded: false,
      };
    case 'window':
      if (event.state === 'list')
        return { ...state, window: event.state, snipeExpanded: true, calcFolded: event.hasList || state.calcFolded };
      if (event.state === 'foreign')
        return {
          ...state,
          window: event.state,
          calcFolded: false,
          snipeExpanded: event.hasBuilding ? false : state.snipeExpanded,
        };
      return { ...state, window: event.state };
    case 'toggleCalc': {
      const calcFolded = !state.calcFolded;
      return { ...state, calcFolded, snipeExpanded: calcFolded || state.snipeExpanded };
    }
    case 'toggleSnipe': {
      const snipeExpanded = !state.snipeExpanded;
      return { ...state, snipeExpanded, calcFolded: snipeExpanded && state.calcFolded };
    }
  }
}

/** how a part shows: absent, open without fold line (the only part with content), unfolded or folded */
export type FoldShow = 'hidden' | 'alone' | 'open' | 'folded';

/**
 * How both parts show with the content they have: a part folds only while the other shows something, so a part that
 * is or becomes empty never leaves the other folded. Without a list there is no snipe section and the calculator has
 * no fold line; without a building the snipe section has no fold line.
 */
export function foldView(state: FoldState, content: FoldContent): { snipe: FoldShow; calc: FoldShow } {
  const snipe: FoldShow = !content.hasList
    ? 'hidden'
    : !content.hasBuilding
      ? 'alone'
      : state.snipeExpanded
        ? 'open'
        : 'folded';
  const calc: FoldShow = !content.hasList || !content.hasBuilding ? 'alone' : state.calcFolded ? 'folded' : 'open';
  return { snipe, calc };
}
