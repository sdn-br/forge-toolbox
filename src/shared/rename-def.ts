// The model called the building definition `cityEntityId` until database version 16 and backup version 3. The database
// upgrade and the import of an older backup rename it in stored rows.

/** Renames `cityEntityId` to `def` in place; a row without it stays as it is. */
export function renameCityEntityId(row: Record<string, unknown>): void {
  if (!('cityEntityId' in row)) return;
  if (row.cityEntityId !== undefined) row.def = row.cityEntityId;
  delete row.cityEntityId;
}
