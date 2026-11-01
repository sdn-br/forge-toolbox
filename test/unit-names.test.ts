import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { battleDetails, catalogUnits } from '../src/content/features/shared/battle-details';
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
  const catalog = stores.catalog;
  catalog.setEras([
    { id: eraId('EarlyMiddleAge'), name: 'Frühes Mittelalter' },
    { id: eraId('ArcticFuture'), name: 'Arktische Zukunft' },
  ]);
  const types = (json: unknown) =>
    ingestion.accept({ kind: 'meta', url: unitTypes.url, response: JSON.stringify(json), at: 0 });
  return { catalog, types };
}

const battle = (...units: string[]): FoughtBattle => ({
  world,
  battleId: 1,
  at: 0,
  opponent: playerId(1001),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: units.map((unitTypeId) => ({ unitTypeId, startHp: 10, endHp: 10 })) },
  defender: { bonuses: {}, units: [] },
});

describe('unit types', () => {
  it('reads name, era and class of the unit types from the metadata file of the game start', () => {
    const { catalog, types } = setup();
    expect(catalog.unitType('EarlyMiddleAge_champion')).toBeUndefined();
    types(unitTypes.json);
    expect(catalog.unitType('EarlyMiddleAge_champion')).toEqual({
      id: 'EarlyMiddleAge_champion',
      name: 'Held',
      era: 'EarlyMiddleAge',
      unitClass: 'fast',
    });
    // a unit of every era has none
    expect(catalog.unitType('rogue')).toEqual({
      id: 'rogue',
      name: 'Agent',
      unitClass: 'light_melee',
    });
    expect(catalog.unitType('unknown_unit')).toBeUndefined();
  });

  it('skips entries without an id or a name and a file that is no list', () => {
    const { catalog, types } = setup();
    types([{ unitTypeId: 'grenadier' }, { name: 'Niemand' }, { unitTypeId: 'clubman', name: 'Unhold' }]);
    types({});
    expect(catalog.unitType('clubman')).toEqual({ id: 'clubman', name: 'Unhold' });
    expect(catalog.unitType('grenadier')).toBeUndefined();
  });

  it('puts name, era, class and hit points into the tooltip of a unit, the type id of a unit it does not know', () => {
    const { catalog, types } = setup();
    types([
      ...unitTypes.json,
      { unitTypeId: 'ArcticFuture_champion', name: 'Held', minEra: 'ArcticFuture', unitClass: 'heavy_melee' },
      { unitTypeId: 'odd_unit', name: 'Sonderling', minEra: 'NoAge', unitClass: 'something_new' },
    ]);
    const vm = battleDetails(battle('ArcticFuture_champion', 'rogue', 'odd_unit', 'unknown_unit'), {
      unit: catalogUnits(catalog),
    });
    expect(vm.own.map((u) => [u.unit, u.tip])).toEqual([
      ['Held', 'Held (Arktische Zukunft)\nTyp: Schwere Einheit\nLP: 10 / 10'],
      ['Agent', 'Agent\nTyp: Leichte Einheit\nLP: 10 / 10'],
      ['Sonderling', 'Sonderling\nLP: 10 / 10'],
      ['unknown_unit', 'unknown_unit\nLP: 10 / 10'],
    ]);
  });
});
