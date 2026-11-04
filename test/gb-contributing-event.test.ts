// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { eraId, playerId } from '../src/shared/ids';
import { featureContext } from './helpers/feature-context';

function setup() {
  const { ctx } = featureContext();
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...ctx, now: Date.now });
  ctx.session.start({ world: ctx.world, playerId: playerId(1), name: 'Ich', era: eraId('IronAge') });
  const heard: unknown[] = [];
  ctx.bus.on('greatBuilding.contributing', (e) => heard.push(e));
  const send = (requestMethod: string, requestData: unknown, requestClass = 'GreatBuildingsService') =>
    ingestion.accept({
      kind: 'request',
      url: '/game/json?h=1',
      request: JSON.stringify([{ requestClass, requestMethod, requestData }]),
      at: 0,
    });
  return { heard, send };
}

describe('greatBuilding.contributing', () => {
  it('comes with the outgoing contribution request, naming the building and whose it is', () => {
    const { heard, send } = setup();
    send('contributeForgePoints', [14, 222, 5, 120, false]);
    expect(heard).toEqual([{ owner: 222, entityId: 14, own: false }]);
  });

  it('marks a contribution to an own building', () => {
    const { heard, send } = setup();
    send('contributeForgePoints', [14, 1, 5, 120, false]);
    expect(heard).toEqual([{ owner: 1, entityId: 14, own: true }]);
  });

  it('ignores other requests and requests without a building', () => {
    const { heard, send } = setup();
    send('getConstruction', [14, 222]);
    const failed = vi.spyOn(console, 'error').mockImplementation(() => {});
    send('contributeForgePoints', 'nonsense');
    expect(heard).toEqual([]);
    expect(failed).not.toHaveBeenCalled();
    failed.mockRestore();
  });
});
