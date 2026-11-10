import { describe, expect, it } from 'vitest';
import { greatBuildingOf, toBuilding, toGreatBuildingEntity } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import { playerId } from '../src/shared/ids';
import fixture from './fixtures/unconnected-buildings.json';

// Own city from StartupService.getData (2026-11-10): the game leaves out `connected` when it is 0.
const entities = fixture.entities as GameCityEntity[];
const me = playerId(1000);
const first = (type: string) => entities.find((e) => e.type === type) as GameCityEntity;
const building = (e: GameCityEntity) => toBuilding(e, me);

describe('connected of a building', () => {
  it('is false for every unconnected great building of the start data', () => {
    const gbs = entities.filter((e) => e.type === 'greatbuilding');
    expect(gbs.length).toBeGreaterThan(1);
    for (const e of gbs) {
      expect(e).not.toHaveProperty('connected');
      expect(building(e)?.connected).toBe(false);
    }
  });

  it('carries into the great building of a known city', () => {
    const b = building(first('greatbuilding'));
    expect(greatBuildingOf(b ?? undefined)?.connected).toBe(false);
    expect(toGreatBuildingEntity(first('greatbuilding'))?.connected).toBe(false);
  });

  it('is false for a great building with connected 0', () => {
    const e = { ...first('greatbuilding'), connected: 0, state: { __class__: 'IdleState' } };
    expect(building(e as GameCityEntity)?.connected).toBe(false);
  });

  it('stays true for a great building with connected 1 or 2', () => {
    for (const connected of [1, 2]) {
      const e = { ...first('greatbuilding'), connected, state: { __class__: 'IdleState' } } as GameCityEntity;
      expect(building(e)?.connected).toBe(true);
      expect(greatBuildingOf(building(e) ?? undefined)?.connected).toBe(true);
      expect(toGreatBuildingEntity(e)?.connected).toBe(true);
    }
  });

  it('stays true for generic buildings without connected, they need no road', () => {
    const generics = entities.filter((e) => e.type === 'generic_building');
    expect(generics.length).toBeGreaterThan(1);
    for (const e of generics) {
      expect(e).not.toHaveProperty('connected');
      expect(building(e)?.connected).toBe(true);
    }
  });

  it('stays true for a street with connected 1', () => {
    expect(building(first('street'))?.connected).toBe(true);
  });

  it('is false for any building in UnconnectedState', () => {
    const e = first('residential');
    expect(e.state?.__class__).toBe('UnconnectedState');
    expect(building(e)?.connected).toBe(false);
  });
});
