// Game format → own model for catalog: metadata files, building definitions, research progress. Nothing outside src/content/game sees the game format.

import { buildingDefId, type EraId, eraId } from '../../shared/ids';
import type { Ingestion } from '../core/ingestion';
import type { CityGrid, UnitType } from '../model/catalog';
import type { ResearchExpansion } from '../model/research';
import { toBuildingDef, toBuildingFiles, toGreatBuildingTiers } from './building-defs';
import type { GameHandlerDeps } from './deps';
import type { GameEra, GameGrid, GameResearchProgress, GameResearchTechnology, GameUnitType } from './game-types';
import { list } from './json';

/**
 * The technologies of the metadata file `research-<hash>` that reward main city expansions, in the order of the file.
 * Only `type: 'expansion'` with `subType: 'main'` counts; outposts and other cities have their own types.
 */
export function toResearchExpansions(json: unknown): ResearchExpansion[] {
  return list<GameResearchTechnology>(json).flatMap((tech) => {
    if (typeof tech?.id !== 'string') return [];
    const amount = (tech.rewards ?? [])
      .filter((r) => r?.type === 'expansion' && r.subType === 'main' && typeof r.amount === 'number')
      .reduce((sum, r) => sum + (r.amount as number), 0);
    return amount > 0 ? [{ tech: tech.id, name: tech.name ?? tech.id, amount }] : [];
  });
}

/** The unlocked technologies from ResearchService.getProgress; null when the response is no progress object. */
export function toUnlockedNodes(data: unknown): string[] | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const nodes = (data as GameResearchProgress).unlockedNodes;
  return Array.isArray(nodes) ? nodes.filter((n): n is string => typeof n === 'string') : null;
}

/** The main grid of the metadata file `grid-<hash>`, its blocks from the sectors of type `Regular`. */
export function toCityGrid(json: unknown): CityGrid | null {
  const grid = list<GameGrid>(json).find((g) => g?.id === 'main');
  if (!grid) return null;
  const blocks = (grid.sectors ?? [])
    .filter((s) => s?.type?.value === 'Regular')
    .flatMap((s) => (s.tilePositions ?? []).map((p) => ({ x: p?.x ?? 0, y: p?.y ?? 0 })));
  return { width: grid.width ?? 0, height: grid.height ?? 0, blocks };
}

/**
 * The unit types of the metadata file `unit_types-<hash>` by their id; entries without id or name are skipped. A unit
 * of every era (`NoAge`: agent, guild raids, event units, legends) has no era.
 */
export function toUnitTypes(json: unknown): UnitType[] {
  return list<GameUnitType>(json).flatMap((u) =>
    typeof u?.unitTypeId === 'string' && typeof u.name === 'string'
      ? [
          {
            id: u.unitTypeId,
            name: u.name,
            ...(typeof u.minEra === 'string' && u.minEra !== 'NoAge' && { era: eraId(u.minEra) }),
            ...(typeof u.unitClass === 'string' && { unitClass: u.unitClass }),
          },
        ]
      : [],
  );
}

/** The eras of the metadata file `research_eras`; an entry without an id is skipped. */
export function toEras(json: unknown): { id: EraId; name: string }[] {
  return list<GameEra>(json).flatMap((e) => (e.era ? [{ id: eraId(e.era), name: e.name ?? e.era }] : []));
}

/** Registers the catalog handlers. */
export function registerCatalog(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { catalog, research } = deps;

  ingestion.onMetaPrefix('building_entity_', (file) => {
    if (file.name === 'building_entity_lookup') {
      catalog.setBuildingFiles(toBuildingFiles(file.json));
      return;
    }
    // the id is in the name; a file the catalog holds already is not translated again
    if (catalog.hasFile(buildingDefId(file.name.slice('building_entity_'.length)), file.url)) return;
    const def = toBuildingDef(file.json);
    if (def) catalog.addFromGame(def, { id: def.id, url: file.url, json: file.json });
  });

  ingestion.onMeta('grid', (file) => {
    const grid = toCityGrid(file.json);
    if (grid) catalog.setCityGrid(grid);
  });

  // the unit types with their names, loaded by the game at start (seen 2026-11-01: 188 types, `name` in the game's
  // language, e.g. `EarlyMiddleAge_champion` → „Held“)
  ingestion.onMeta('unit_types', (file) => catalog.setUnitTypes(toUnitTypes(file.json)));

  ingestion.onMeta('research_eras', (file) => {
    catalog.setEras(toEras(file.json));
  });

  // the tiers of great building levels, copper and gold (seen 2026-11-05)
  ingestion.onMeta('great_building_tiers', (file) => catalog.setGreatBuildingTiers(toGreatBuildingTiers(file.json)));

  ingestion.onMeta('research', (file) => research.setExpansions(toResearchExpansions(file.json)));

  // comes with the startup data; some batches carry a getProgress that is no object, those are skipped.
  // debt: only the progress of the start is read. ceiling: a technology finished during play still counts as open
  // until reload. upgrade: follow the response that reports a finished technology once it is recorded.
  ingestion.on('ResearchService', 'getProgress', ({ data }) => {
    const nodes = toUnlockedNodes(data);
    if (nodes) research.setUnlocked(nodes);
  });
}
