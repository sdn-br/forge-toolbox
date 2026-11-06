import type { BuildingDefId } from '../../shared/ids';

/** A cost the game showed: Forge points to build a great building of `type` from `level` up to `level + 1`. */
export interface LevelCostRow {
  type: BuildingDefId;
  level: number;
  fp: number;
  /** when it was seen */
  at: number;
}

export interface GbLevelCostsApi {
  /** every cost seen, of all worlds: the costs are the same everywhere */
  'gbLevelCosts.all': { arg: Record<string, never>; result: { rows: LevelCostRow[] } };
  /** each row replaces what was known for its type and level */
  'gbLevelCosts.put': { arg: { rows: LevelCostRow[] }; result: undefined };
}
