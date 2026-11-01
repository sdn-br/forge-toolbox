// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { measuredArmy } from '../src/content/domain/measured-army';
import { battleDetails } from '../src/content/features/shared/battle-details';
import { toBattle } from '../src/content/game/convert';
import type { GameBattle } from '../src/content/game/game-types';
import { battleDetailsView } from '../src/content/ui/battle-details';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { FoughtBattle } from '../src/shared/model';
import fixture from './fixtures/pvp-battle.json';

const battle = (change: Partial<FoughtBattle> = {}): FoughtBattle => ({
  world: worldId('de20'),
  battleId: 1,
  at: 0,
  opponent: playerId(1001),
  result: 'won',
  auto: true,
  rounds: 3,
  era: eraId('ColonialAge'),
  attacker: {
    bonuses: { attack_boost: 233, attacker_defense_boost: 134, military_boost: 135 },
    units: [
      { unitTypeId: 'rogue', startHp: 10, endHp: 8 },
      { unitTypeId: 'grenadier', startHp: 10, endHp: 0 },
    ],
  },
  defender: {
    bonuses: { defender_attack_boost: 353, defense_boost: 390, fierce_resistance: 32.5, advanced_tactics: 20.5 },
    units: [{ unitTypeId: 'feudal_knight', startHp: 10, endHp: 0 }],
  },
  ...change,
});

describe('battle details', () => {
  it('shows both sides unit by unit with their hit points before and after', () => {
    const vm = battleDetails(battle());
    expect(vm.own).toEqual([
      { unit: 'rogue', tip: 'rogue\nLP: 8 / 10', health: 0.8, dead: false },
      { unit: 'grenadier', tip: 'grenadier\nLP: 0 / 10', health: 0, dead: true },
    ]);
    expect(vm.opponent).toEqual([{ unit: 'feudal_knight', tip: 'feudal_knight\nLP: 0 / 10', health: 0, dead: true }]);
  });

  it('sums up result, kind and rounds', () => {
    expect(battleDetails(battle()).summary).toBe('gewonnen, Autokampf, 3 Runden');
    expect(battleDetails(battle({ result: 'surrendered', auto: false, rounds: 1 })).summary).toBe(
      'aufgegeben, manuell, 1 Runde',
    );
    expect(battleDetails(battle({ result: 'lost' })).summary).toBe('verloren, Autokampf, 3 Runden');
  });

  it('shows the measured armies unless left out', () => {
    expect(battleDetails(battle(), { measured: measuredArmy(battle()) }).army).toEqual({
      own: { attack: 368, defense: 269 },
      opponent: { attack: 406, defense: 443 },
    });
    expect(battleDetails(battle()).army).toBeUndefined();
  });

  it('draws one column per side, the armies in the heads with their label as tooltip, then the units as tiles', () => {
    const root = document.createElement('div');
    render(battleDetailsView(battleDetails(battle(), { measured: measuredArmy(battle()) })), root);
    const heads = [...root.querySelectorAll('th')].map((c) => c.textContent?.trim());
    expect(heads).toEqual(['Deine Einheiten368 % / 269 %', 'Gegner406 % / 443 %']);
    const sides = [...root.querySelectorAll('td')].map((td) =>
      [...td.querySelectorAll('.unit-tile')].map((tile) => tile.getAttribute('data-tip')),
    );
    expect(sides).toEqual([['rogue\nLP: 8 / 10', 'grenadier\nLP: 0 / 10'], ['feudal_knight\nLP: 0 / 10']]);
    expect(root.textContent).toContain('gewonnen, Autokampf, 3 Runden');
  });

  it('draws the health bar by the hit points left, a fallen unit muted', () => {
    const root = document.createElement('div');
    render(battleDetailsView(battleDetails(battle())), root);
    const tiles = [...root.querySelectorAll('.unit-tile')];
    const bar = (i: number) => tiles[i]?.querySelector<HTMLElement>('.unit-health > span')?.style.width;
    expect([bar(0), bar(1), bar(2)]).toEqual(['80%', '0%', '0%']);
    expect(tiles.map((tile) => tile.classList.contains('dead'))).toEqual([false, true, true]);
  });

  it('shows the units of a recorded battle', () => {
    const start = fixture.batch.find((e) => e.requestMethod === 'startByBattleType')?.responseData as GameBattle;
    const recorded = toBattle(worldId('de20'), start, playerId(fixture.me)) as FoughtBattle;
    const vm = battleDetails(recorded);
    expect(vm.own.map((u) => `${u.unit} ${u.tip.split('\n').at(-1)}`)).toEqual([
      'grenadier LP: 4 / 10',
      'grenadier LP: 10 / 10',
      'rogue LP: 10 / 10',
      'rogue LP: 8 / 10',
      'rogue LP: 10 / 10',
      'rogue LP: 10 / 10',
      'rogue LP: 10 / 10',
      'rogue LP: 10 / 10',
    ]);
    expect(vm.opponent).toHaveLength(8);
    expect(vm.opponent.every((u) => u.dead)).toBe(true);
    expect(vm.summary).toBe('gewonnen, Autokampf, 3 Runden');
  });

  it('puts name, era, class and hit points into the tooltip of a unit', () => {
    const root = document.createElement('div');
    const unit = (id: string) =>
      id === 'rogue' ? { name: 'Agent', era: 'Kolonialzeit', unitClass: 'light_melee' } : undefined;
    render(battleDetailsView(battleDetails(battle(), { unit })), root);
    const tips = [...root.querySelectorAll('.unit-tile')].map((tile) => tile.getAttribute('data-tip'));
    expect(tips[0]).toBe('Agent (Kolonialzeit)\nTyp: Leichte Einheit\nLP: 8 / 10');
    expect(tips[1]).toBe('grenadier\nLP: 0 / 10');
  });
});
