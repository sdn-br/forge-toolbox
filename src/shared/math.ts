/** `value` within `min` and `max`; a max below the min gives the min */
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
