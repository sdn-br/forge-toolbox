import { describe, expect, it } from 'vitest';
import {
  type FoldEvent,
  type FoldState,
  foldReducer,
  foldView,
  initialFold,
} from '../src/content/features/gb-calculator/fold-state';

const state = (change: Partial<FoldState> = {}): FoldState => ({ ...initialFold, ...change });
const run = (from: FoldState, ...events: FoldEvent[]) => events.reduce(foldReducer, from);
const both = { hasList: true, hasBuilding: true };

describe('fold state of the GB calculator box', () => {
  it('starts with both parts unfolded and no window', () => {
    expect(initialFold).toEqual({ snipeExpanded: false, calcFolded: false, window: 'none' });
  });

  it('a new list unfolds the snipe section and folds the calculator', () => {
    expect(run(state({ snipeExpanded: false, calcFolded: false }), { type: 'listArrived' })).toMatchObject({
      snipeExpanded: true,
      calcFolded: true,
    });
  });

  it("a building of another player than the list's owner unfolds the calculator and folds the section", () => {
    expect(
      run(state({ snipeExpanded: true, calcFolded: true }), { type: 'buildingOpened', ofListOwner: false }),
    ).toMatchObject({ snipeExpanded: false, calcFolded: false });
  });

  it("a building of the list's owner unfolds the calculator and keeps the section as it is", () => {
    const opened: FoldEvent = { type: 'buildingOpened', ofListOwner: true };
    expect(run(state({ snipeExpanded: true, calcFolded: true }), opened)).toMatchObject({
      snipeExpanded: true,
      calcFolded: false,
    });
    expect(run(state({ snipeExpanded: false }), opened).snipeExpanded).toBe(false);
  });

  it("folds the section for a building of the list's owner when the game already shows the building's window", () => {
    expect(
      run(state({ snipeExpanded: true, calcFolded: true, window: 'foreign' }), {
        type: 'buildingOpened',
        ofListOwner: true,
      }),
    ).toMatchObject({ snipeExpanded: false, calcFolded: false });
  });

  it('the list window unfolds the section and folds the calculator, but only while there is a list', () => {
    expect(run(state(), { type: 'window', state: 'list', ...both })).toEqual({
      snipeExpanded: true,
      calcFolded: true,
      window: 'list',
    });
    expect(run(state(), { type: 'window', state: 'list', hasList: false, hasBuilding: true })).toEqual({
      snipeExpanded: true,
      calcFolded: false,
      window: 'list',
    });
  });

  it('a foreign window unfolds the calculator and folds the section, but only while the calculator shows a building', () => {
    const from = state({ snipeExpanded: true, calcFolded: true });
    expect(run(from, { type: 'window', state: 'foreign', ...both })).toEqual({
      snipeExpanded: false,
      calcFolded: false,
      window: 'foreign',
    });
    expect(run(from, { type: 'window', state: 'foreign', hasList: true, hasBuilding: false })).toEqual({
      snipeExpanded: true,
      calcFolded: false,
      window: 'foreign',
    });
  });

  it('no window or the own one folds nothing, it only remembers the window', () => {
    const from = state({ snipeExpanded: true, calcFolded: true, window: 'list' });
    expect(run(from, { type: 'window', state: 'none', ...both })).toEqual({ ...from, window: 'none' });
    expect(run(from, { type: 'window', state: 'own', ...both })).toEqual({ ...from, window: 'own' });
  });

  it('the player folds and unfolds each part, the other stays when it is open', () => {
    const open = state({ snipeExpanded: true, calcFolded: false });
    expect(run(open, { type: 'toggleCalc' })).toMatchObject({ snipeExpanded: true, calcFolded: true });
    expect(run(open, { type: 'toggleCalc' }, { type: 'toggleCalc' })).toMatchObject(open);
    expect(run(open, { type: 'toggleSnipe' })).toMatchObject({ snipeExpanded: false, calcFolded: false });
    expect(run(open, { type: 'toggleSnipe' }, { type: 'toggleSnipe' })).toMatchObject(open);
  });

  it('keeps one part open: folding the calculator while the section is folded unfolds the section', () => {
    expect(run(state({ snipeExpanded: false, calcFolded: false }), { type: 'toggleCalc' })).toMatchObject({
      snipeExpanded: true,
      calcFolded: true,
    });
  });

  it('keeps one part open: folding the section while the calculator is folded unfolds the calculator', () => {
    expect(run(state({ snipeExpanded: true, calcFolded: true }), { type: 'toggleSnipe' })).toMatchObject({
      snipeExpanded: false,
      calcFolded: false,
    });
  });
});

describe('how the parts of the box show', () => {
  it('shows each part folded or open by the state while both have content', () => {
    expect(foldView(state({ snipeExpanded: true, calcFolded: true }), both)).toEqual({ snipe: 'open', calc: 'folded' });
    expect(foldView(state({ snipeExpanded: false, calcFolded: false }), both)).toEqual({
      snipe: 'folded',
      calc: 'open',
    });
  });

  it('without a list there is no section and the calculator has no fold line, whatever the state', () => {
    expect(foldView(state({ calcFolded: true }), { hasList: false, hasBuilding: true })).toEqual({
      snipe: 'hidden',
      calc: 'alone',
    });
  });

  it('while the calculator shows no building the section stays open without fold line', () => {
    expect(foldView(state({ snipeExpanded: false, calcFolded: true }), { hasList: true, hasBuilding: false })).toEqual({
      snipe: 'alone',
      calc: 'alone',
    });
  });
});
