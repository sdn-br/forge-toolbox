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
  const link: ArmyLink = {
    post: (command) => posted.push(command),
    onTarget: (listener) => {
      answer = listener;
    },
  };
  watchArmyTarget(bus, link);
  const targets = vi.fn();
  bus.on('army.target', targets);
  return { bus, posted, answer: (seq: number, id: number) => answer(seq, id), targets };
}

describe('watchArmyTarget', () => {
  it('asks the page for the opponent of a pvp army window and passes the answer on', () => {
    const { bus, posted, answer, targets } = setup();
    bus.emit('army.opened', { battleType: 'pvp' });
    expect(posted).toEqual([{ tag: ARMY_TAG, from: 'content', type: 'target', seq: 1 }]);
    answer(1, 5412792);
    expect(targets).toHaveBeenCalledExactlyOnceWith({ opponent: playerId(5412792) });
  });

  it.each(['gvg', 'guild_expedition', 'pvp_arena'])('does not ask for a %s battle', (battleType) => {
    const { bus, posted } = setup();
    bus.emit('army.opened', { battleType });
    expect(posted).toEqual([]);
  });

  it('ignores a late answer to an older window', () => {
    const { bus, answer, targets } = setup();
    bus.emit('army.opened', { battleType: 'pvp' });
    bus.emit('army.opened', { battleType: 'pvp' });
    answer(1, 111);
    expect(targets).not.toHaveBeenCalled();
    answer(2, 222);
    expect(targets).toHaveBeenCalledExactlyOnceWith({ opponent: playerId(222) });
  });

  it('takes only the first answer to an ask', () => {
    const { bus, answer, targets } = setup();
    bus.emit('army.opened', { battleType: 'pvp' });
    answer(1, 111);
    answer(1, 222);
    expect(targets).toHaveBeenCalledExactlyOnceWith({ opponent: playerId(111) });
  });

  it('ignores an answer nobody asked for', () => {
    const { answer, targets } = setup();
    answer(0, 111);
    answer(1, 111);
    expect(targets).not.toHaveBeenCalled();
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
