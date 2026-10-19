// Derived values of a city: army boosts, plunder repel, what can be plundered. Pure, so fixtures test it.
import type { BuildingDefId, EraId } from '../../shared/ids';
import { type Boost, type BuildingDef, boostsAt, boostsFor, type LevelBonus, productFor } from '../stores/catalog';
import type { Building, City, Product } from '../stores/city-model';
import { connectedLinks, type Placed, place, setLevels } from './city-layout';

export interface ArmyValues {
  attack: number;
  defense: number;
}

/** a finished production in a city; the game hides when the others are ready, so only finished ones count */
export interface Plunderable {
  building: number;
  name: string;
  resources: Record<string, number>;
}

export interface CityAssessment {
  army: { attacker: ArmyValues; defender: ArmyValues };
  plunderRepel: number;
  plunderable: Plunderable[];
  missingDefs: BuildingDefId[];
  /** boosts of buildings, sets and chains by game type, feature `all`; same scope as the game's own boost list */
  boostTotals: Record<string, number>;
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

export interface AssessContext {
  def(id: BuildingDefId): BuildingDef | undefined;
  /** era of a level, in game order (0 = StoneAge) */
  eraByLevel(level: number): EraId | undefined;
}

/**
 * Classic multi-age buildings keep the era they were built or last upgraded in, as `level` (index into the era
 * order). Everything else counts with the city era. Checked 2026-10-19 against the game's own boosts.
 */
function eraOf(b: Building, def: BuildingDef, ctx: AssessContext, cityEra: EraId): EraId {
  if (def.generic || b.type === 'greatbuilding' || b.level === undefined) return cityEra;
  return ctx.eraByLevel(b.level) ?? cityEra;
}

function givesBoosts(b: Building): boolean {
  if (b.state.kind === 'constructing') return false;
  // unconnected buildings lose their boosts, except culture buildings, which need no road
  if (b.state.kind === 'unconnected') return b.type === 'culture';
  return true;
}

/** no plunder seen with them; the Siegesturm, which only produces medals, can never be plundered */
const NOT_PLUNDERABLE_RESOURCES = ['medals'];

function plunderableOf(b: Building, def: BuildingDef, city: City): Plunderable | null {
  if (!def.flags.plunderable) return null;
  const s = b.state;
  if (s.kind !== 'finished') return null;
  // a motivated building is protected against plundering
  if (def.flags.motivatable && s.motivated) return null;
  // a visited city sends no product for finished generic buildings, their definition knows it
  const product: Product | undefined = s.product ?? productFor(def, city.era);
  const resources = Object.fromEntries(
    Object.entries(product?.resources ?? {}).filter(([id, n]) => n > 0 && !NOT_PLUNDERABLE_RESOURCES.includes(id)),
  );
  if (Object.keys(resources).length === 0) return null;
  return { building: b.id, name: def.name, resources };
}

const bonusesUpTo = (bonuses: LevelBonus[], level: number, era: EraId): Boost[] =>
  bonuses.filter((b) => b.level <= level).flatMap((b) => boostsAt(b.boosts, era));

export function assessCity(city: City, ctx: AssessContext): CityAssessment {
  const sums: Record<Side, number> = { aa: 0, ad: 0, da: 0, dd: 0 };
  let plunderRepel = 0;
  const plunderable: Plunderable[] = [];
  const missing = new Set<BuildingDefId>();
  const placed: Placed[] = [];

  for (const b of city.buildings.values()) {
    const def = ctx.def(b.def);
    if (def) placed.push(place(b, def));
    else missing.add(b.def);
  }
  const active = placed.filter((p) => givesBoosts(p.building));
  const setLevel = setLevels(active);
  const linked = connectedLinks(active);

  const boostTotals: Record<string, number> = {};
  const addBoosts = (boosts: Boost[]) => {
    for (const boost of boosts) {
      if (boost.feature !== 'all') continue;
      boostTotals[boost.type] = (boostTotals[boost.type] ?? 0) + boost.value;
      for (const side of BOOST_SIDES[boost.type] ?? []) sums[side] += boost.value;
      if (boost.type === 'plunder_repel') plunderRepel += boost.value;
    }
  };

  for (const { building: b, def } of active) {
    const era = eraOf(b, def, ctx, city.era);
    addBoosts(boostsFor(def, era));
    if (def.set) addBoosts(bonusesUpTo(def.set.bonuses, setLevel.get(b.id) ?? 0, era));
    // debt: a connected link adds its level 1 bonus only. ceiling: chains whose links grow with chain length.
    // upgrade: when the game shows a higher chain bonus than the box for such a chain.
    if (def.chain && linked.has(b.id)) addBoosts(bonusesUpTo(def.chain.bonuses, 1, era));
    const bonus = b.greatBuilding?.bonus;
    if (bonus) {
      for (const side of GREAT_BUILDING_SIDES[bonus.type] ?? []) sums[side] += bonus.value;
      if (bonus.type === 'plunder_repel') plunderRepel += bonus.value;
    }
  }

  for (const { building: b, def } of placed) {
    const p = plunderableOf(b, def, city);
    if (p) plunderable.push(p);
  }

  return {
    army: { attacker: { attack: sums.aa, defense: sums.ad }, defender: { attack: sums.da, defense: sums.dd } },
    plunderRepel: Math.round(plunderRepel * 100) / 100,
    plunderable,
    missingDefs: [...missing],
    boostTotals,
  };
}
