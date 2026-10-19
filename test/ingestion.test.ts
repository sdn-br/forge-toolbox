import { describe, expect, it, vi } from 'vitest';
import { Ingestion, metaId } from '../src/content/core/ingestion';

const json = (entries: unknown[]) => ({
  kind: 'json' as const,
  url: 'x/game/json?h=1',
  request: null,
  response: JSON.stringify(entries),
  at: 0,
});
const entry = (requestClass: string, requestMethod: string, responseData: unknown = {}) => ({
  requestClass,
  requestMethod,
  responseData,
});

describe('Ingestion', () => {
  it('routes each entry only to handlers of its service and method', () => {
    const ingestion = new Ingestion();
    const visit = vi.fn();
    const other = vi.fn();
    ingestion.on('OtherPlayerService', 'visitPlayer', visit);
    ingestion.on('CityMapService', 'reset', other);
    ingestion.accept(json([entry('OtherPlayerService', 'visitPlayer', { a: 1 }), entry('TimeService', 'updateTime')]));
    expect(visit).toHaveBeenCalledWith({
      service: 'OtherPlayerService',
      method: 'visitPlayer',
      data: { a: 1 },
      via: 'json',
    });
    expect(other).not.toHaveBeenCalled();
  });

  it('routes every method of a service to its service handlers', () => {
    const ingestion = new Ingestion();
    const battlefield = vi.fn();
    ingestion.onService('BattlefieldService', battlefield);
    ingestion.accept(
      json([entry('BattlefieldService', 'submitMove'), entry('BattlefieldService', 'surrender'), entry('A', 'b')]),
    );
    expect(battlefield.mock.calls.map((c) => c[0].method)).toEqual(['submitMove', 'surrender']);
  });

  it('handles the startup data before everything else in the same response', () => {
    const ingestion = new Ingestion();
    const order: string[] = [];
    ingestion.on('StartupService', 'getData', () => order.push('startup'));
    ingestion.on('CityMapService', 'reset', () => order.push('reset'));
    ingestion.accept(json([entry('CityMapService', 'reset'), entry('StartupService', 'getData')]));
    expect(order).toEqual(['startup', 'reset']);
  });

  it('keeps going when a handler throws', () => {
    const ingestion = new Ingestion();
    const second = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ingestion.on('A', 'b', () => {
      throw new Error('boom');
    });
    ingestion.on('A', 'b', second);
    ingestion.accept(json([entry('A', 'b')]));
    expect(second).toHaveBeenCalled();
  });

  it('ignores traffic that is not a list of game entries', () => {
    const ingestion = new Ingestion();
    const handler = vi.fn();
    ingestion.on('A', 'b', handler);
    ingestion.accept({ kind: 'ws', data: 'not json', at: 0 });
    ingestion.accept({ kind: 'ws', data: '{"requestClass":"A"}', at: 0 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes metadata files with name and hash to prefix handlers', () => {
    const ingestion = new Ingestion();
    const handler = vi.fn();
    ingestion.onMeta('building_entity_', handler);
    ingestion.accept({
      kind: 'meta',
      url: 'https://cdn/start/metadata?id=building_entity_R_X-ab12',
      response: '{"id":"R_X"}',
      at: 0,
    });
    ingestion.accept({ kind: 'meta', url: 'https://cdn/start/metadata?id=research-cd34', response: '{}', at: 0 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      name: 'building_entity_R_X',
      hash: 'ab12',
      json: { id: 'R_X' },
    });
  });
});

describe('metaId', () => {
  it('splits at the last dash', () => {
    expect(metaId('https://cdn/start/metadata?id=building_entity_lookup-9f9f')).toEqual({
      name: 'building_entity_lookup',
      hash: '9f9f',
    });
    expect(metaId('https://cdn/start/metadata?id=nohash')).toBeNull();
  });
});
