import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { type ArmyLink, watchArmyTarget } from '../src/content/game/engine/army-target';
import { armyTarget } from '../src/marker/army';
import { ARMY_TAG, type ArmyCommand } from '../src/shared/army-protocol';
import { playerId } from '../src/shared/ids';

function setup() {
  const bus = createBus();
  const posted: ArmyCommand[] = [];
  let answer: (seq: number, id: number) => void = () => {};
  let close: (seq: number) => void = () => {};
  const link: ArmyLink = {
    post: (command) => posted.push(command),
    onTarget: (listener) => {
      answer = listener;
    },
    onClosed: (listener) => {
      close = listener;
    },
  };
  watchArmyTarget(bus, link);
  const targets = vi.fn();
  bus.on('army.target', targets);
  const closed = vi.fn();
  bus.on('army.closed', closed);
  return {
    bus,
    posted,
    answer: (seq: number, id: number) => answer(seq, id),
    close: (seq: number) => close(seq),
    targets,
    closed,
  };
}

describe('watchArmyTarget', () => {
  it('asks the page for the opponent of a pvp army window and passes the answer on', () => {
    const { bus, posted, answer, targets } = setup();
    bus.emit('army.opened', { kind: 'pvp' });
    expect(posted).toEqual([{ tag: ARMY_TAG, from: 'content', type: 'target', seq: 1 }]);
    answer(1, 5412792);
    expect(targets).toHaveBeenCalledExactlyOnceWith({ opponent: playerId(5412792), kind: 'pvp' });
  });

  it('asks for the opponent of an arena army window and names the arena', () => {
    const { bus, posted, answer, targets } = setup();
    bus.emit('army.opened', { kind: 'pvpArena' });
    expect(posted).toHaveLength(1);
    answer(1, 1002);
    expect(targets).toHaveBeenCalledExactlyOnceWith({ opponent: playerId(1002), kind: 'pvpArena' });
  });

  it('does not ask for another battle', () => {
    const { bus, posted } = setup();
    bus.emit('army.opened', { kind: 'other' });
    expect(posted).toEqual([]);
  });

  it('ignores a late answer to an older window', () => {
    const { bus, answer, targets } = setup();
    bus.emit('army.opened', { kind: 'pvp' });
    bus.emit('army.opened', { kind: 'pvp' });
    answer(1, 111);
    expect(targets).not.toHaveBeenCalled();
    answer(2, 222);
    expect(targets).toHaveBeenCalledExactlyOnceWith({ opponent: playerId(222), kind: 'pvp' });
  });

  it('takes only the first answer to an ask', () => {
    const { bus, answer, targets } = setup();
    bus.emit('army.opened', { kind: 'pvp' });
    answer(1, 111);
    answer(1, 222);
    expect(targets).toHaveBeenCalledExactlyOnceWith({ opponent: playerId(111), kind: 'pvp' });
  });

  it('ignores an answer nobody asked for', () => {
    const { answer, targets } = setup();
    answer(0, 111);
    answer(1, 111);
    expect(targets).not.toHaveBeenCalled();
  });
});

describe('army window closed', () => {
  it('passes on the close of the window that showed its opponent, once', () => {
    const { bus, answer, close, closed } = setup();
    bus.emit('army.opened', { kind: 'pvp' });
    answer(1, 111);
    close(1);
    close(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('ignores the close of an older window and of a window without an opponent', () => {
    const { bus, answer, close, closed } = setup();
    close(1);
    bus.emit('army.opened', { kind: 'pvp' });
    answer(1, 111);
    bus.emit('army.opened', { kind: 'pvp' });
    answer(2, 222);
    close(1);
    expect(closed).not.toHaveBeenCalled();
    close(2);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('armyTarget (page module)', () => {
  // shaped like the engine on de10, 2026-10-26: a hidden backdrop, then the army window opened from the social bar
  const armyWindow = (battleType: unknown, change: Record<string, unknown> = {}) => ({
    _attackButton: {},
    settings: { battleType, enemyName: 'Redcowboy' },
    ...change,
  });
  const pvp = { type: 'pvp', attackerPlayerId: 8001381, defenderPlayerId: 5412792, isRevenge: false };
  const stage = (...windows: unknown[]) =>
    ({
      __children: [{}, { windowContainer: { __children: [{ __visible: false }, ...windows] } }],
    }) as Parameters<typeof armyTarget>[0];

  it('reads the defender of the open pvp army window', () => {
    expect(armyTarget(stage(armyWindow(pvp)))).toBe(5412792);
  });

  it('reads the defender of the open arena army window', () => {
    const arena = { type: 'pvp_arena', attackerPlayerId: 1000, defenderPlayerId: 1002, opponentSerial: 7002 };
    expect(armyTarget(stage(armyWindow(arena)))).toBe(1002);
  });

  it('finds nothing without an engine, a window container or an army window', () => {
    expect(armyTarget(undefined)).toBeUndefined();
    expect(armyTarget({ __children: [{}] })).toBeUndefined();
    expect(armyTarget(stage())).toBeUndefined();
    expect(armyTarget(stage({ settings: { battleType: pvp } }))).toBeUndefined();
  });

  it('skips a hidden army window', () => {
    expect(armyTarget(stage(armyWindow(pvp, { __visible: false })))).toBeUndefined();
  });

  it.each([
    ['another battle type', { ...pvp, type: 'gvg' }],
    ['no defender', { ...pvp, defenderPlayerId: undefined }],
    ['defender 0', { ...pvp, defenderPlayerId: 0 }],
    ['a defender as text', { ...pvp, defenderPlayerId: '5412792' }],
    ['no battle type', undefined],
  ])('finds nothing for %s', (_name, battleType) => {
    expect(armyTarget(stage(armyWindow(battleType)))).toBeUndefined();
  });
});
