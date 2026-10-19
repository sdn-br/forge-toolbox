// Building definitions from the game metadata → own BuildingDef. Two formats exist:
// classic definitions (`abilities`, `boostHintEraMap`) and GenericCityEntity (`components` per era).
import { buildingDefId } from '../../shared/ids';
import type { Boost, BuildingDef } from '../stores/catalog';
import type { Product } from '../stores/city-model';

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

function genericProduct(production: unknown): Product | undefined {
  const option = list(isObject(production) ? production.options : undefined)[0];
  if (!option) return undefined;
  const product: Product = { resources: {} };
  for (const p of list(option.products)) {
    for (const [k, n] of Object.entries(resources(p.playerResources)))
      product.resources[k] = (product.resources[k] ?? 0) + n;
  }
  return product;
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
  let hasChain = has('ChainLinkAbility') || has('ChainStartAbility');
  if (components) {
    for (const [era, c] of Object.entries(components)) {
      if (!isObject(c)) continue;
      for (const b of list(isObject(c.boosts) ? c.boosts.boosts : undefined)) add(era, toBoost(b));
      const product = genericProduct(c.production);
      if (product) productByEra[era] = product;
      if (isObject(c.socialInteraction) && typeof c.socialInteraction.interactionType === 'string') {
        interaction = c.socialInteraction.interactionType;
      }
      if (c.chain) hasChain = true;
    }
  }
  for (const a of abilities) {
    if (a.__class__ !== 'BoostAbility') continue;
    for (const hint of list(a.boostHints)) {
      const map = isObject(hint.boostHintEraMap) ? hint.boostHintEraMap : {};
      for (const [era, b] of Object.entries(map)) add(era, toBoost(b));
    }
  }

  const type = typeof json.type === 'string' ? json.type : undefined;
  const excluded =
    NOT_PLUNDERABLE.some(has) || abilities.some((a) => typeof a.gridId === 'string' && a.gridId !== 'main');
  return {
    id: buildingDefId(json.id),
    name: typeof json.name === 'string' ? json.name : json.id,
    generic,
    type,
    flags: {
      motivatable: has('MotivatableAbility') || interaction === 'motivate',
      polishable: has('PolishableAbility') || interaction === 'polish',
      plunderable: !excluded && (generic || (type !== undefined && PLUNDERABLE_TYPES.includes(type))),
    },
    hasSetOrChain: hasChain || has('BonusOnSetAdjacencyAbility'),
    boostsByEra,
    productByEra,
  };
}
