import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { battleDetails } from '../src/content/features/shared/battle-details';
import { registerGameHandlers } from '../src/content/game/handlers';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { FoughtBattle } from '../src/shared/model';
import unitTypes from './fixtures/unit-types.json';
import { testStores } from './helpers/stores';

const world = worldId('de20');

function setup() {
  const ingestion = new Ingestion();
  const { bus, stores } = testStores();
  registerGameHandlers(ingestion, { world, bus, now: Date.now, ...stores });
  return { ingestion, catalog: stores.catalog };
}

const battle = (own: string, opponent: string): FoughtBattle => ({
  world,
  battleId: 1,
  at: 0,
  opponent: playerId(1001),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [{ unitTypeId: own, startHp: 10, endHp: 10 }] },
  defender: { bonuses: {}, units: [{ unitTypeId: opponent, startHp: 10, endHp: 0 }] },
});

describe('unit names', () => {
  it('reads the names of the unit types from the metadata file of the game start', () => {
    const { ingestion, catalog } = setup();
    expect(catalog.unitName('EarlyMiddleAge_champion')).toBeUndefined();
    ingestion.accept({ kind: 'meta', url: unitTypes.url, response: JSON.stringify(unitTypes.json), at: 0 });
    expect(catalog.unitName('EarlyMiddleAge_champion')).toBe('Held');
    expect(catalog.unitName('rogue')).toBe('Agent');
    expect(catalog.unitName('unknown_unit')).toBeUndefined();
  });

  it('skips entries without an id or a name and a file that is no list', () => {
    const { ingestion, catalog } = setup();
    const json = [{ unitTypeId: 'grenadier' }, { name: 'Niemand' }, { unitTypeId: 'clubman', name: 'Unhold' }];
    ingestion.accept({ kind: 'meta', url: unitTypes.url, response: JSON.stringify(json), at: 0 });
    ingestion.accept({ kind: 'meta', url: unitTypes.url, response: '{}', at: 0 });
    expect(catalog.unitName('clubman')).toBe('Unhold');
    expect(catalog.unitName('grenadier')).toBeUndefined();
  });

  it('shows the name in the battle details, the type id of a unit it does not know', () => {
    const { ingestion, catalog } = setup();
    ingestion.accept({ kind: 'meta', url: unitTypes.url, response: JSON.stringify(unitTypes.json), at: 0 });
    const vm = battleDetails(battle('EarlyMiddleAge_champion', 'unknown_unit'), {
      unitName: (id) => catalog.unitName(id),
    });
    expect(vm.own[0]?.unit).toBe('Held');
    expect(vm.opponent[0]?.unit).toBe('unknown_unit');
  });
});
