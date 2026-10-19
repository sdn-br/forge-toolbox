// Derived values of a city: army boosts, plunder repel, what can be plundered. Pure, so fixtures test it.
import type { BuildingDefId } from '../../shared/ids';
import { type BuildingDef, boostsFor, productFor } from '../stores/catalog';
import type { Building, City, Product } from '../stores/city-model';

export interface ArmyValues {
  attack: number;
  defense: number;
}

export interface Plunderable {
  building: number;
  name: string;
  resources: Record<string, number>;
  /** undefined: ready now */
  readyAt?: number;
}

export interface CityAssessment {
  army: { attacker: ArmyValues; defender: ArmyValues };
  plunderRepel: number;
  plunderable: Plunderable[];
  missingDefs: BuildingDefId[];
  /** the city has set or chain buildings, whose bonuses are not counted yet */
  ignoresSetsAndChains: boolean;
}

type Side = 'aa' | 'ad' | 'da' | 'dd';

const BOOST_SIDES: Record<string, Side[]> = {
  att_boost_attacker: ['aa'],
  def_boost_attacker: ['ad'],
  att_boost_defender: ['da'],
  def_boost_defender: ['dd'],
  att_def_boost_attacker: ['aa', 'ad'],
  att_def_boost_defender: ['da', 'dd'],
  att_def_boost_attacker_defender: ['aa', 'ad', 'da', 'dd'],
};

// same mapping as Forge Hammer (js/web/boosts/js/boosts.js, Boosts.Mapper), checked 2026-10-19
const GREAT_BUILDING_SIDES: Record<string, Side[]> = {
  military_boost: ['aa', 'ad'],
  fierce_resistance: ['da', 'dd'],
  advanced_tactics: ['aa', 'ad', 'da', 'dd'],
};

export type DefLookup = (id: BuildingDefId) => BuildingDef | undefined;

function givesBoosts(b: Building): boolean {
  if (b.state.kind === 'constructing') return false;
  // unconnected buildings lose their boosts, except culture buildings, which need no road
  if (b.state.kind === 'unconnected') return b.type === 'culture';
  return true;
}

function plunderableOf(b: Building, def: BuildingDef, city: City): Plunderable | null {
  if (!def.flags.plunderable) return null;
  const s = b.state;
  if (s.kind !== 'producing' && s.kind !== 'finished') return null;
  // a motivated building is protected against plundering
  if (def.flags.motivatable && s.motivated) return null;
  const product: Product | undefined = s.product ?? productFor(def, city.era);
  const resources = Object.fromEntries(Object.entries(product?.resources ?? {}).filter(([, n]) => n > 0));
  if (Object.keys(resources).length === 0) return null;
  return { building: b.id, name: def.name, resources, readyAt: s.kind === 'producing' ? s.readyAt : undefined };
}

export function assessCity(city: City, defs: DefLookup): CityAssessment {
  const sums: Record<Side, number> = { aa: 0, ad: 0, da: 0, dd: 0 };
  let plunderRepel = 0;
  const plunderable: Plunderable[] = [];
  const missing = new Set<BuildingDefId>();
  let ignoresSetsAndChains = false;

  for (const b of city.buildings.values()) {
    const def = defs(b.def);
    if (!def) {
      missing.add(b.def);
      continue;
    }
    if (givesBoosts(b)) {
      for (const boost of boostsFor(def, city.era)) {
        if (boost.feature !== 'all') continue;
        for (const side of BOOST_SIDES[boost.type] ?? []) sums[side] += boost.value;
        if (boost.type === 'plunder_repel') plunderRepel += boost.value;
      }
      const bonus = b.greatBuilding?.bonus;
      if (bonus) {
        for (const side of GREAT_BUILDING_SIDES[bonus.type] ?? []) sums[side] += bonus.value;
        if (bonus.type === 'plunder_repel') plunderRepel += bonus.value;
      }
      if (def.hasSetOrChain) ignoresSetsAndChains = true;
    }
    const p = plunderableOf(b, def, city);
    if (p) plunderable.push(p);
  }

  plunderable.sort((a, b) => (a.readyAt ?? 0) - (b.readyAt ?? 0));
  return {
    army: { attacker: { attack: sums.aa, defense: sums.ad }, defender: { attack: sums.da, defense: sums.dd } },
    plunderRepel: Math.round(plunderRepel * 100) / 100,
    plunderable,
    missingDefs: [...missing],
    ignoresSetsAndChains,
  };
}
