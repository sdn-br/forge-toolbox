// The Forge point cost of any level of a great building, learned from the costs the toolbox sees in the game. Pure: the
// observations of one building type and its definition go in, a lookup by level comes out.
//
// The cost model, checked against the game on 2026-11-05 (Arche, Zeusstatue, Galataturm, Die blaue Galaxie): the
// definition lists the levels 0 to 9. From level 10 on each level costs the one before plus a step, an integer per type
// and segment of start levels. Level 100 is the exception: it costs level 99 times 1.05, the steps go on from 101. The
// value stays unrounded through the chain and is rounded, halves up, at the end. A type that follows another curve shows
// as observations that fit no integer step; such a segment is disabled.
//
// Costs shipped with the toolbox join the own observations (`withShipped`), and `seedJson` writes the file they come from.

/** the cost of one level and whether it is computed rather than seen or listed */
export interface LevelCost {
  fp: number;
  /** computed from learned steps, not seen in the game or listed in the definition */
  estimate: boolean;
}

/** the cost of building `level` up to `level + 1`; undefined when it cannot be told */
export type LevelCosts = (level: number) => LevelCost | undefined;

/** the levels the definition lists */
const LISTED_LEVELS = 10;
/** level 100 costs level 99 times 21 / 20 */
const JUMP_LEVEL = 100;
const JUMP_NUMERATOR = 21;

/** values are kept in twentieths, so the 1.05 jump stays an exact integer */
const SCALE = 20;
const round = (scaled: number) => Math.floor((scaled + SCALE / 2) / SCALE);

/**
 * Start levels whose costs grow by one step per level: `base` is the level the steps count from, its value comes from
 * the segment before (the jump for the segment from 100). Up to 99 all values are integers, so a seen value is exact.
 */
const SEGMENTS: readonly { first: number; last: number; base: number; integer: boolean }[] = [
  { first: 10, last: 39, base: 9, integer: true },
  { first: 40, last: 69, base: 39, integer: true },
  { first: 70, last: 99, base: 69, integer: true },
  { first: JUMP_LEVEL, last: 300, base: JUMP_LEVEL, integer: false },
  { first: 301, last: 400, base: 300, integer: false },
  { first: 401, last: Number.POSITIVE_INFINITY, base: 400, integer: false },
];

/** what is learned about one segment */
export interface SegmentSteps {
  first: number;
  last: number;
  /** the integer step per level; undefined when not enough is seen */
  step?: number;
  /** the observations fit no single integer step: no estimate in the segment and no chain through it */
  disabled: boolean;
}

interface Segment extends SegmentSteps {
  base: number;
  /** the exact value at `base`, in twentieths, when chained from the definition */
  start?: number;
  /** a seen level of the segment, to count from when there is no exact start */
  anchor?: { level: number; fp: number };
}

/** an integer step that every observation fits, from the exact start or from the observations among each other */
function stepOf(
  observations: readonly [number, number][],
  base: number,
  start: number | undefined,
): { step?: number; fits: boolean } {
  let step: number | undefined;
  const take = (rise: number, levels: number) => {
    const s = rise / levels;
    if (!Number.isInteger(s) || (step !== undefined && s !== step)) return false;
    step = s;
    return true;
  };
  if (start !== undefined) {
    // values of a segment share the fraction of its start, so the rounded ones grow by exact steps
    const rounded = round(start);
    for (const [level, fp] of observations) {
      const n = level - base;
      if (n === 0 ? fp !== rounded : !take(fp - rounded, n)) return { fits: false };
    }
    return { step, fits: true };
  }
  const [first, ...rest] = observations;
  if (!first || rest.length === 0) return { fits: true };
  const last = rest[rest.length - 1] as [number, number];
  if (!take(last[1] - first[1], last[0] - first[0])) return { fits: false };
  for (const [level, fp] of rest) if (fp - first[1] !== (level - first[0]) * (step as number)) return { fits: false };
  return { step, fits: true };
}

function learn(listed: readonly number[], seen: ReadonlyMap<number, number>): Segment[] {
  const sorted = [...seen].sort((a, b) => a[0] - b[0]);
  const segments: Segment[] = [];
  const nine = seen.get(LISTED_LEVELS - 1) ?? listed[LISTED_LEVELS - 1];
  /** the exact value at the end of the segment before, in twentieths */
  let carry: number | undefined = nine === undefined ? undefined : nine * SCALE;
  for (const s of SEGMENTS) {
    const start = s.first === JUMP_LEVEL && carry !== undefined ? (carry * JUMP_NUMERATOR) / SCALE : carry;
    const observations = sorted.filter(([level]) => level >= s.first && level <= s.last);
    const { step, fits } = stepOf(observations, s.base, start);
    const anchor = observations[0] && { level: observations[0][0], fp: observations[0][1] };
    const segment: Segment = {
      first: s.first,
      last: s.last,
      base: s.base,
      disabled: !fits,
      ...(fits && step !== undefined && { step }),
      ...(fits && start !== undefined && { start }),
      ...(fits && anchor && { anchor }),
    };
    segments.push(segment);
    carry = undefined;
    if (!fits || step === undefined || s.last === Number.POSITIVE_INFINITY) continue;
    if (start !== undefined) carry = start + (s.last - s.base) * step * SCALE;
    // up to 99 a seen value is exact, so it starts the chain as well as the definition would
    else if (s.integer && anchor) carry = (anchor.fp + (s.last - anchor.level) * step) * SCALE;
  }
  return segments;
}

/** the computed cost of `level` in its segment, rounded; undefined when the segment cannot tell */
function computed(segment: Segment, level: number): number | undefined {
  if (segment.disabled) return undefined;
  const n = level - segment.base;
  if (segment.start !== undefined && (n === 0 || segment.step !== undefined))
    return round(segment.start + n * (segment.step ?? 0) * SCALE);
  if (segment.anchor && segment.step !== undefined)
    return segment.anchor.fp + (level - segment.anchor.level) * segment.step;
  return undefined;
}

/** The steps of each segment as learned from the observations; for tests and diagnosis. */
export function learnSteps(listed: readonly number[], seen: ReadonlyMap<number, number>): SegmentSteps[] {
  return learn(listed, seen).map(({ first, last, step, disabled }) => ({
    first,
    last,
    disabled,
    ...(step !== undefined && { step }),
  }));
}

/**
 * The cost of each level of one great building type. `listed` is `strategy_points_for_upgrade` of its definition,
 * `seen` maps a start level to the Forge points the game showed for it. A seen value is exact, so is a listed one;
 * everything else comes from the learned steps and is an estimate.
 */
export function levelCosts(listed: readonly number[], seen: ReadonlyMap<number, number>): LevelCosts {
  const segments = learn(listed, seen);
  return (level) => {
    if (!Number.isInteger(level) || level < 0) return undefined;
    const fp = seen.get(level);
    if (fp !== undefined) return { fp, estimate: false };
    if (level < LISTED_LEVELS) {
      const cost = listed[level];
      return cost === undefined ? undefined : { fp: cost, estimate: false };
    }
    const segment = segments.find((s) => level >= s.first && level <= s.last);
    const value = segment && computed(segment, level);
    return value === undefined ? undefined : { fp: value, estimate: true };
  };
}

/** the index of the segment `level` belongs to in SEGMENTS; -1 for the listed levels 0 to 9 */
const segmentOf = (level: number) => SEGMENTS.findIndex((s) => level >= s.first && level <= s.last);

/**
 * What a type has seen when the costs shipped with the toolbox join the own observations. Shipped costs count as seen,
 * but the own ones win: an own cost replaces the shipped one of its level, and where the own costs of a segment and the
 * shipped ones do not fit one step together (the game changed the costs since), the segment keeps only the own costs.
 * Segment by segment from level 10, so a segment is checked with the start that the ones before it chain to.
 */
export function withShipped(
  listed: readonly number[],
  own: ReadonlyMap<number, number>,
  shipped: ReadonlyMap<number, number>,
): ReadonlyMap<number, number> {
  if (shipped.size === 0) return own;
  const merged = new Map<number, number>();
  const rowsOf = (map: ReadonlyMap<number, number>, segment: number) =>
    [...map].filter(([level]) => segmentOf(level) === segment && !(map === shipped && own.has(level)));
  for (let segment = -1; segment < SEGMENTS.length; segment++) {
    const ownRows = rowsOf(own, segment);
    const shippedRows = rowsOf(shipped, segment);
    const together = [...shippedRows, ...ownRows];
    const contradicts =
      segment >= 0 &&
      ownRows.length > 0 &&
      shippedRows.length > 0 &&
      learn(listed, new Map([...merged, ...together]))[segment]?.disabled;
    for (const [level, fp] of contradicts ? ownRows : together) merged.set(level, fp);
  }
  return merged;
}

/** the file of shipped costs: per type (game id) the Forge points of each start level, keys are the levels */
export type SeedFile = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** the costs of the file of shipped costs, one entry per type and level */
export function seedEntries(file: SeedFile): { type: string; level: number; fp: number }[] {
  return Object.entries(file).flatMap(([type, levels]) =>
    Object.entries(levels).map(([level, fp]) => ({ type, level: Number(level), fp })),
  );
}

/**
 * The file of shipped costs from what each type has seen, every level kept: one line per type without spaces, its
 * levels ascending, the types sorted. The formatter of the repo leaves this one file alone, so it stays this short.
 */
export function seedJson(seen: ReadonlyMap<string, ReadonlyMap<number, number>>): string {
  const types = [...seen.keys()]
    .filter((type) => (seen.get(type)?.size ?? 0) > 0)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (types.length === 0) return '{}\n';
  const lines = types.map((type) => {
    const levels = [...(seen.get(type) ?? [])].sort((a, b) => a[0] - b[0]);
    return `  ${JSON.stringify(type)}: {${levels.map(([level, fp]) => `"${level}":${fp}`).join(',')}}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}
