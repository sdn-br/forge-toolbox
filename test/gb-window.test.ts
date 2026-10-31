import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { type GbWindowLink, watchGbWindow } from '../src/content/game/engine/gb-window';
import { gbWindow } from '../src/marker/gb-window';
import {
  GB_WINDOW_TAG,
  type GbWindowCommand,
  type GbWindowState,
  parseGbWindowCommand,
  parseGbWindowEvent,
} from '../src/shared/gb-window-protocol';
import { playerId } from '../src/shared/ids';

function setup() {
  const bus = createBus();
  const posted: GbWindowCommand[] = [];
  let report: (state: GbWindowState) => void = () => {};
  const link: GbWindowLink = {
    post: (command) => posted.push(command),
    onState: (listener) => {
      report = listener;
    },
  };
  watchGbWindow(bus, link);
  const changes = vi.fn();
  bus.on('gbWindow.changed', changes);
  return { bus, posted, report: (state: GbWindowState) => report(state), changes };
}

const WATCH = { tag: GB_WINDOW_TAG, from: 'content', type: 'watch' };

describe('watchGbWindow', () => {
  it('asks the page to watch once a list or a great building opens', () => {
    const { bus, posted } = setup();
    expect(posted).toEqual([]);
    bus.emit('greatBuildings.listed', { owner: playerId(1001), entityIds: [], at: 0, askedByGame: false });
    bus.emit('greatBuilding.opened', { owner: playerId(1001), entityId: 1, own: false });
    bus.emit('greatBuilding.opened', { owner: playerId(1), entityId: 2, own: true });
    expect(posted).toEqual([WATCH, WATCH, WATCH]);
  });

  it('passes each change on', () => {
    const { report, changes } = setup();
    report('list');
    report('foreign');
    report('none');
    expect(changes.mock.calls.map(([e]) => e.state)).toEqual(['list', 'foreign', 'none']);
  });

  it('passes no repeated state on, and none first is no change', () => {
    const { report, changes } = setup();
    report('none');
    report('own');
    report('own');
    expect(changes).toHaveBeenCalledExactlyOnceWith({ state: 'own' });
  });
});

describe('gb window protocol', () => {
  const event = (change: Record<string, unknown> = {}) => ({
    tag: GB_WINDOW_TAG,
    from: 'page',
    type: 'state',
    state: 'list',
    ...change,
  });

  it('takes the ask to watch and refuses anything else', () => {
    expect(parseGbWindowCommand({ ...WATCH, extra: 1 })).toEqual(WATCH);
    expect(parseGbWindowCommand({ ...WATCH, tag: 'forge-toolbox-army' })).toBeNull();
    expect(parseGbWindowCommand({ ...WATCH, from: 'page' })).toBeNull();
    expect(parseGbWindowCommand({ ...WATCH, type: 'state' })).toBeNull();
    expect(parseGbWindowCommand(null)).toBeNull();
  });

  it.each(['none', 'list', 'foreign', 'own'])('takes the state %s and copies only its fields', (state) => {
    expect(parseGbWindowEvent({ ...event({ state }), extra: 1 })).toEqual(event({ state }));
  });

  it.each([
    ['another tag', event({ tag: 'forge-toolbox-marker' })],
    ['the content side', event({ from: 'content' })],
    ['another type', event({ type: 'watch' })],
    ['an unknown state', event({ state: 'market' })],
    ['no state', event({ state: undefined })],
    ['a state of another kind', event({ state: 1 })],
  ])('refuses %s', (_name, data) => {
    expect(parseGbWindowEvent(data)).toBeNull();
  });
});

describe('gbWindow (page module)', () => {
  // shaped like the engine on de20, 2026-10-28: a dim overlay, then the list and the great building opened from it
  const list = () => ({ gbOverviewItemData: [], ownerVO: {}, _playerId: 1001 });
  const greatBuilding = (own: unknown) => ({ _entity: {}, _isOwnBuilding: own, _bonusModel: {} });
  const stage = (...windows: unknown[]) =>
    ({
      __children: [{}, { windowContainer: { __children: [{ __visible: false }, ...windows] } }],
    }) as Parameters<typeof gbWindow>[0];

  it('finds nothing without an engine, a window container or a window of a great building', () => {
    expect(gbWindow(undefined)).toBe('none');
    expect(gbWindow({ __children: [{}] })).toBe('none');
    expect(gbWindow(stage())).toBe('none');
    expect(gbWindow(stage({ __visible: true }, { _attackButton: {} }))).toBe('none');
  });

  it('finds the list of a player', () => {
    expect(gbWindow(stage(list()))).toBe('list');
  });

  it('tells a foreign great building from an own one', () => {
    expect(gbWindow(stage(greatBuilding(false)))).toBe('foreign');
    expect(gbWindow(stage(greatBuilding(true)))).toBe('own');
  });

  it('counts a great building over the list as the great building', () => {
    expect(gbWindow(stage(list(), greatBuilding(false)))).toBe('foreign');
    expect(gbWindow(stage(greatBuilding(false), list()))).toBe('foreign');
    expect(gbWindow(stage(list(), greatBuilding(true)))).toBe('own');
  });

  it('puts a foreign great building before an own one', () => {
    expect(gbWindow(stage(greatBuilding(true), greatBuilding(false)))).toBe('foreign');
  });

  it('skips hidden windows', () => {
    expect(gbWindow(stage({ ...list(), __visible: false }))).toBe('none');
    expect(gbWindow(stage(list(), { ...greatBuilding(false), __visible: false }))).toBe('list');
  });

  it.each([
    ['without its owner flag', { _entity: {}, _bonusModel: {} }],
    ['with the owner flag as text', greatBuilding('true')],
    ['without its bonus model', { _entity: {}, _isOwnBuilding: false }],
    ['a list without its player', { gbOverviewItemData: [], ownerVO: {} }],
  ])('finds nothing for a window %s', (_name, w) => {
    expect(gbWindow(stage(w))).toBe('none');
  });
});
