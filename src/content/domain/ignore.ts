// Why a great building counts as ignored: the building itself, its owner, or both.

export interface IgnoreReason {
  building: boolean;
  owner: boolean;
}

/** The reason, or undefined when neither the building nor its owner is ignored. `owner` is undefined for a player the store does not know. */
export const ignoreReason = (building: boolean, owner: boolean | undefined): IgnoreReason | undefined =>
  building || owner === true ? { building, owner: owner === true } : undefined;
