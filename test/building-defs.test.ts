import { describe, expect, it } from 'vitest';
import { toBuildingDef } from '../src/content/game/building-defs';

describe('street requirement of a definition', () => {
  it('reads the street level of a classic definition from its requirements', () => {
    const def = toBuildingDef({
      id: 'R_MultiAge_Residential1',
      type: 'residential',
      width: 2,
      length: 2,
      requirements: { street_connection_level: 2, min_era: 'BronzeAge' },
    });
    expect(def?.street).toBe(2);
  });

  it('takes a classic definition with requirements but without a street level as needing none', () => {
    const def = toBuildingDef({ id: 'D_Statue', type: 'decoration', width: 1, length: 1, requirements: {} });
    expect(def?.street).toBe(0);
  });

  it('reads the street requirement component of a generic definition', () => {
    const def = toBuildingDef({
      id: 'W_MultiAge_Generic',
      __class__: 'GenericCityEntity',
      components: {
        AllAge: {
          placement: { size: { x: 3, y: 4 } },
          streetConnectionRequirement: { __class__: 'StreetConnectionRequirementComponent', requiredLevel: 1 },
        },
      },
    });
    expect(def?.street).toBe(1);
  });

  it('takes a generic definition without the component as needing no street', () => {
    const def = toBuildingDef({
      id: 'W_MultiAge_Deco',
      __class__: 'GenericCityEntity',
      components: { AllAge: { placement: { size: { x: 1, y: 1 } } } },
    });
    expect(def?.street).toBe(0);
  });

  it('leaves the street requirement unknown when a classic definition has no requirements', () => {
    const def = toBuildingDef({ id: 'R_Trimmed', type: 'residential', width: 2, length: 2 });
    expect(def?.street).toBeUndefined();
  });
});
