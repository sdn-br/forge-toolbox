import { describe, expect, it } from 'vitest';
import { playerId, worldId } from '../src/shared/ids';
import { dataImported, importConcerns, isDataImported } from '../src/shared/messages';

const de20 = worldId('de20');
const de10 = worldId('de10');
const me = { world: de20, player: playerId(1) };

describe('data imported message', () => {
  it('carries the imported profiles and is recognised by its shape', () => {
    const message = dataImported([me]);
    expect(isDataImported(message)).toBe(true);
    expect(isDataImported('forge-toolbox.dataImported')).toBe(false);
    expect(isDataImported({ type: message.type, profiles: 'x' })).toBe(false);
  });

  it('concerns the tab of an imported profile only', () => {
    expect(importConcerns([me], de20, me)).toBe(true);
    expect(importConcerns([{ world: de20, player: playerId(2) }], de20, me)).toBe(false);
    expect(importConcerns([{ world: de10, player: playerId(1) }], de20, me)).toBe(false);
  });

  it('goes by the world while the tab does not know its player yet', () => {
    expect(importConcerns([{ world: de20, player: playerId(2) }], de20, undefined)).toBe(true);
    expect(importConcerns([{ world: de10, player: playerId(2) }], de20, undefined)).toBe(false);
  });
});
