import { describe, expect, it } from 'vitest';
import { bodyText } from '../src/proxy/body';

describe('bodyText', () => {
  const json = '[{"requestClass":"OtherPlayerService","requestMethod":"plunderById","requestData":[1001,350]}]';
  it('reads the ArrayBuffer the game sends', () => {
    expect(bodyText(new TextEncoder().encode(json).buffer)).toBe(json);
  });
  it('reads strings and typed arrays, drops the rest', () => {
    expect(bodyText(json)).toBe(json);
    expect(bodyText(new TextEncoder().encode(json))).toBe(json);
    expect(bodyText(null)).toBeNull();
    expect(bodyText(new FormData())).toBeNull();
  });
});
