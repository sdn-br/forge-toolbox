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
      { unit: 'rogue', hp: '8/10 LP', dead: false },
      { unit: 'grenadier', hp: 'gefallen', dead: true },
    ]);
    expect(vm.opponent).toEqual([{ unit: 'feudal_knight', hp: 'gefallen', dead: true }]);
  });

  it('sums up result, kind and rounds', () => {
    expect(battleDetails(battle()).summary).toBe('gewonnen, Autokampf, 3 Runden');
    expect(battleDetails(battle({ result: 'surrendered', auto: false, rounds: 1 })).summary).toBe(
      'aufgegeben, manuell, 1 Runde',
    );
    expect(battleDetails(battle({ result: 'lost' })).summary).toBe('verloren, Autokampf, 3 Runden');
  });

  it('shows the measured armies unless left out', () => {
    expect(battleDetails(battle(), measuredArmy(battle())).army).toEqual({
      own: { attack: 368, defense: 269 },
      opponent: { attack: 406, defense: 443 },
    });
    expect(battleDetails(battle()).army).toBeUndefined();
  });

  it('draws both sides next to each other', () => {
    const root = document.createElement('div');
    render(battleDetailsView(battleDetails(battle(), measuredArmy(battle()))), root);
    const rows = [...root.querySelectorAll('tr')].map((r) =>
      [...r.querySelectorAll('th, td')].map((c) => c.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['Deine Einheiten', '', 'Gegner', ''],
      ['rogue', '8/10 LP', 'feudal_knight', 'gefallen'],
      ['grenadier', 'gefallen', '', ''],
      ['Angriff / Verteidigung', '368 % / 269 %', '', '406 % / 443 %'],
    ]);
    expect(root.textContent).toContain('gewonnen, Autokampf, 3 Runden');
  });

  it('shows the units of a recorded battle', () => {
    const start = fixture.batch.find((e) => e.requestMethod === 'startByBattleType')?.responseData as GameBattle;
    const recorded = toBattle(worldId('de20'), start, playerId(fixture.me)) as FoughtBattle;
    const vm = battleDetails(recorded);
    expect(vm.own.map((u) => `${u.unit} ${u.hp}`)).toEqual([
      'grenadier 4/10 LP',
      'grenadier 10/10 LP',
      'rogue 10/10 LP',
      'rogue 8/10 LP',
      'rogue 10/10 LP',
      'rogue 10/10 LP',
      'rogue 10/10 LP',
      'rogue 10/10 LP',
    ]);
    expect(vm.opponent).toHaveLength(8);
    expect(vm.opponent.every((u) => u.dead)).toBe(true);
    expect(vm.summary).toBe('gewonnen, Autokampf, 3 Runden');
  });
});
