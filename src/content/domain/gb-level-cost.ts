// The Forge point cost of a level of a great building that is not open in the game. Pure: the definition of the
// building lists the levels 0 to 9, the file shipped with the toolbox (src/content/data/gb-level-costs.json, every level
// of every great building from the German FoE wiki, written by scripts/wiki-level-costs.mjs) has the rest. Nothing is
// computed beyond the file: a level it does not list is unknown. The real cost of an open level comes from the game
// and does not pass through here.

/** the file of shipped costs: per type (game id) the Forge points of each start level, keys are the levels */
export type LevelCostFile = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** the cost of building `level` up to `level + 1`; undefined when it is not known */
export type LevelCosts = (level: number) => number | undefined;

/**
 * The cost of each level of one great building type. `listed` is `strategy_points_for_upgrade` of its definition, it
 * comes from the game and wins; `shipped` are the levels of the type in the shipped file.
 */
export function levelCosts(listed: readonly number[], shipped?: Readonly<Record<string, number>>): LevelCosts {
  return (level) => {
    if (!Number.isInteger(level) || level < 0) return undefined;
    return listed[level] ?? shipped?.[level];
  };
}
