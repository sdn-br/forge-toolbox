// Building definitions from the game metadata → own BuildingDef. Two formats exist:
// classic definitions (`abilities`, `boostHintEraMap`) and GenericCityEntity (`components` per era).
import { type BuildingDefId, buildingDefId } from '../../shared/ids';
import type { Boost, BoostsByEra, BuildingDef, GreatBuildingDef, LevelBonus, Rect } from '../model/catalog';
import type { Product } from '../model/city';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);

function toBoost(hint: unknown): Boost | null {
  if (!isObject(hint) || typeof hint.type !== 'string') return null;
  return {
    type: hint.type,
    feature: typeof hint.targetedFeature === 'string' ? hint.targetedFeature : 'all',
    value: Number(hint.value ?? 0),
  };
}

function resources(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const r = isObject(v) ? v.resources : undefined;
  if (isObject(r)) for (const [k, n] of Object.entries(r)) if (typeof n === 'number') out[k] = n;
  return out;
}

/** What the first option yields without motivation; products marked `onlyWhenMotivated` need it. */
function genericProduct(production: unknown): Product | undefined {
  const option = list(isObject(production) ? production.options : undefined)[0];
  if (!option) return undefined;
  const product: Product = { resources: {} };
  for (const p of list(option.products)) {
    if (p.onlyWhenMotivated === true) continue;
    for (const [k, n] of Object.entries(resources(p.playerResources)))
      product.resources[k] = (product.resources[k] ?? 0) + n;
  }
  return product;
}

/** `{ AllAge: hint }` or `{ IronAge: hint, … }` → boosts per era */
function boostMap(map: unknown): BoostsByEra {
  const out: BoostsByEra = {};
  if (!isObject(map)) return out;
  for (const [era, hint] of Object.entries(map)) {
    const boost = toBoost(hint);
    if (boost) out[era] = [boost];
  }
  return out;
}

function levelBonuses(bonuses: unknown): LevelBonus[] {
  return list(bonuses).map((b) => {
    // generic chains list plain boosts, classic definitions a boost per era
    const plain = list(b.boosts)
      .map(toBoost)
      .filter((x): x is Boost => x !== null);
    return { level: Number(b.level ?? 1), boosts: plain.length ? { AllAge: plain } : boostMap(b.boost) };
  });
}

function rects(linkPositions: unknown): Rect[] {
  return list(linkPositions).map((p) => {
    const a = isObject(p.topLeftPoint) ? p.topLeftPoint : {};
    const b = isObject(p.bottomRightPoint) ? p.bottomRightPoint : {};
    // the game leaves out coordinates that are 0
    return { x1: Number(a.x ?? 0), y1: Number(a.y ?? 0), x2: Number(b.x ?? 0), y2: Number(b.y ?? 0) };
  });
}

function sizeOf(json: Json, components: Json | undefined): { width: number; length: number } {
  if (typeof json.width === 'number' && typeof json.length === 'number')
    return { width: json.width, length: json.length };
  const all = components && isObject(components.AllAge) ? components.AllAge : {};
  const size = isObject(all.placement) && isObject(all.placement.size) ? all.placement.size : {};
  return { width: Number(size.x ?? 1), length: Number(size.y ?? 1) };
}

/**
 * Street level a building needs, 0 for none. Assumed game format, the recorded definitions are trimmed and lack it:
 * classic definitions carry `requirements.street_connection_level`, generic ones a `streetConnectionRequirement`
 * component with `requiredLevel`. Undefined when a classic definition has no `requirements` at all.
 */
function streetOf(json: Json, components: Json | undefined, generic: boolean): number | undefined {
  if (generic) {
    for (const c of Object.values(components ?? {})) {
      const r = isObject(c) ? c.streetConnectionRequirement : undefined;
      if (isObject(r)) return Number(r.requiredLevel ?? 1);
    }
    return 0;
  }
  if (!isObject(json.requirements)) return undefined;
  return Number(json.requirements.street_connection_level ?? 0);
}

/**
 * The era and level costs of a great building. The era is `requirements.min_era` (`NoAge` for the buildings of every
 * era, seen 2026-10-19), else the era in the id `X_<Era>_Landmark1`. A production bonus of type `strategy_points` lists the
 * Forge points per level (seen 2026-10-23: 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6 for levels 0 to 10).
 */
function greatBuildingOf(json: Json): GreatBuildingDef | undefined {
  const costs = json.strategy_points_for_upgrade;
  if (!Array.isArray(costs) || !costs.every((c) => typeof c === 'number')) return undefined;
  const minEra = isObject(json.requirements) ? json.requirements.min_era : undefined;
  const era = typeof minEra === 'string' ? minEra : /^X_([A-Za-z]+)_/.exec(String(json.id))?.[1];
  if (!era) return undefined;
  const bonus = isObject(json.production_bonus) ? json.production_bonus : undefined;
  const values = bonus?.type === 'strategy_points' ? bonus.values : undefined;
  const fpProduction =
    Array.isArray(values) && values.every((v) => typeof v === 'number') ? (values as number[]) : undefined;
  return { era: era === 'NoAge' ? 'AllAge' : era, levelCosts: costs, ...(fpProduction && { fpProduction }) };
}

const NOT_PLUNDERABLE = ['AddResourcesToGuildTreasuryAbility', 'RandomChestRewardAbility', 'NotPlunderableAbility'];
const PLUNDERABLE_TYPES = ['production', 'goods', 'residential', 'clan_power_production'];

export function toBuildingDef(json: unknown): BuildingDef | null {
  if (!isObject(json) || typeof json.id !== 'string') return null;
  const abilities = list(json.abilities);
  const has = (cls: string) => abilities.some((a) => a.__class__ === cls);
  const components = isObject(json.components) ? json.components : undefined;
  const generic = json.__class__ === 'GenericCityEntity';

  const boostsByEra: Record<string, Boost[]> = {};
  const productByEra: Record<string, Product> = {};
  const add = (era: string, boost: Boost | null) => {
    if (boost) boostsByEra[era] = [...(boostsByEra[era] ?? []), boost];
  };

  let interaction: string | undefined;
  let chain: BuildingDef['chain'];
  if (components) {
    for (const [era, c] of Object.entries(components)) {
      if (!isObject(c)) continue;
      for (const b of list(isObject(c.boosts) ? c.boosts.boosts : undefined)) add(era, toBoost(b));
      const product = genericProduct(c.production);
      if (product) productByEra[era] = product;
      if (isObject(c.socialInteraction) && typeof c.socialInteraction.interactionType === 'string') {
        interaction = c.socialInteraction.interactionType;
      }
      if (isObject(c.chain) && typeof c.chain.chainId === 'string') {
        const config = isObject(c.chain.config) ? c.chain.config : {};
        chain = {
          id: c.chain.chainId,
          start: config.__class__ === 'ChainStartConfig' || config.bonuses === undefined,
          links: rects(c.chain.linkPositions),
          bonuses: levelBonuses(config.bonuses),
        };
      }
    }
  }
  for (const a of abilities) {
    if (a.__class__ !== 'BoostAbility') continue;
    for (const hint of list(a.boostHints)) {
      const map = isObject(hint.boostHintEraMap) ? hint.boostHintEraMap : {};
      for (const [era, b] of Object.entries(map)) add(era, toBoost(b));
    }
  }

  let set: BuildingDef['set'];
  for (const a of abilities) {
    if (a.__class__ === 'BonusOnSetAdjacencyAbility' && typeof a.setId === 'string') {
      set = { id: a.setId, bonuses: levelBonuses(a.bonuses) };
    }
    if ((a.__class__ === 'ChainStartAbility' || a.__class__ === 'ChainLinkAbility') && typeof a.chainId === 'string') {
      chain = {
        id: a.chainId,
        start: a.__class__ === 'ChainStartAbility',
        links: rects(a.linkPositions),
        bonuses: isObject(a.bonusGiven) ? levelBonuses([a.bonusGiven]) : [],
      };
    }
  }

  const type = typeof json.type === 'string' ? json.type : undefined;
  const excluded =
    NOT_PLUNDERABLE.some(has) || abilities.some((a) => typeof a.gridId === 'string' && a.gridId !== 'main');
  const street = streetOf(json, components, generic);
  const motivatable = has('MotivatableAbility') || interaction === 'motivate';
  const greatBuilding = greatBuildingOf(json);
  return {
    id: buildingDefId(json.id),
    name: typeof json.name === 'string' ? json.name : json.id,
    generic,
    type,
    flags: {
      motivatable,
      polishable: has('PolishableAbility') || interaction === 'polish',
      // a generic building is plunderable only if it can be motivated (Siegesturm, Wunschbrunnen, Druidentempel)
      plunderable: !excluded && (generic ? motivatable : type !== undefined && PLUNDERABLE_TYPES.includes(type)),
    },
    size: sizeOf(json, components),
    ...(street !== undefined && { street }),
    boostsByEra,
    productByEra,
    set,
    chain,
    ...(greatBuilding && { greatBuilding }),
  };
}

const FILE_PREFIX = 'building_entity_';

/**
 * Where each definition's file lies, from the metadata file `building_entity_lookup` the game loads at start: an array
 * of `{ identifier: 'building_entity_<id>', url, __class__: 'StaticData' }` (seen 2026-11-01, the URL carries the
 * file's hash). Entries in another shape are skipped.
 */
export function toBuildingFiles(json: unknown): Map<BuildingDefId, string> {
  const files = new Map<BuildingDefId, string>();
  for (const e of list(json)) {
    const { identifier, url } = e;
    if (typeof identifier === 'string' && identifier.startsWith(FILE_PREFIX) && typeof url === 'string')
      files.set(identifier.slice(FILE_PREFIX.length) as BuildingDefId, url);
  }
  return files;
}
