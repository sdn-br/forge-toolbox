import { describe, expect, it } from 'vitest';
import { toGreatBuildingList } from '../src/content/game/convert';
import { playerId } from '../src/shared/ids';

const row = (owner: number, extra: Record<string, unknown> = {}) => ({
  entity_id: owner * 10,
  city_entity_id: 'X_AllAge_Atlantis',
  name: 'Atlantis Museum',
  level: 3,
  max_progress: 100,
  current_progress: 10,
  player: { player_id: owner, name: `P${owner}` },
  ...extra,
});

describe('toGreatBuildingList', () => {
  it('bundles names, owners and rows, leaves the own player out and keeps owners of rows without costs', () => {
    const list = toGreatBuildingList([row(1), row(2), row(3, { max_progress: undefined })], playerId(2));
    expect(list.names).toEqual({ X_AllAge_Atlantis: 'Atlantis Museum' });
    expect(list.rows.map((r) => r.owner)).toEqual([1]);
    expect(list.owners.map((o) => o.id)).toEqual([1, 3]);
  });
});
