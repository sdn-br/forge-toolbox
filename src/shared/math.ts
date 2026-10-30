/** `value` within `min` and `max`; a max below the min gives the min */
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

// Floating point products like 5 × 1.9 come out a hair below .5; the epsilon rounds them as the arithmetic means.
export const EPSILON = 1e-9;

/** Commercial rounding, halves away from zero. */
export const roundHalfUp = (x: number): number => Math.sign(x) * Math.floor(Math.abs(x) + 0.5 + EPSILON);
