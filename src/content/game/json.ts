// Guards for game JSON of unknown shape, shared by the converters.

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** the entries of an array, [] for anything else; the caller names the entry type */
export const list = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** a finite number, else undefined */
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** the number entries of a plain object by key; anything else gives {} */
export const numbers = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObject(v)) for (const [k, n] of Object.entries(v)) if (typeof n === 'number') out[k] = n;
  return out;
};

/** like `numbers`, but null when `v` is no plain object */
export const numbersOrNull = (v: unknown): Record<string, number> | null => (isObject(v) ? numbers(v) : null);
