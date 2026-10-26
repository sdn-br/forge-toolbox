// The world is in the address, the own player id only in the startup data. Until it comes, nothing knows which profile
// to load, so the traffic waits here and goes through in its order once the profile has started.
import type { WorldId } from '../../shared/ids';
import type { Profile } from '../../shared/profile';
import type { Traffic } from '../../shared/proxy-protocol';
import { toSession } from '../game/convert';
import type { GameStartup } from '../game/game-types';
import { Ingestion } from './ingestion';
import { logError } from './log';

export interface StartupGate {
  /** the receiver for the proxy */
  receive: (traffic: Traffic) => void;
  /** settles once the held traffic went through and the traffic flows live */
  started: Promise<void>;
}

/**
 * `start` loads the profile and resolves to the receiver of the live traffic, which then gets the held traffic first, in
 * order, and everything after it.
 */
export function startupGate(
  world: WorldId,
  start: (profile: Profile) => Promise<(traffic: Traffic) => void>,
): StartupGate {
  const held: Traffic[] = [];
  let live: ((traffic: Traffic) => void) | null = null;
  let found = false;
  let started: () => void = () => {};
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const probe = new Ingestion();
  probe.on('StartupService', 'getData', ({ data }) => {
    const session = toSession(world, (data as GameStartup).user_data);
    if (!session || found) return;
    found = true;
    start({ world, player: session.playerId }).then(
      (receive) => {
        // traffic that came while loading waits here too; the loop and the switch run in one go, so nothing overtakes
        for (const traffic of held.splice(0)) receive(traffic);
        live = receive;
        started();
      },
      (error) => logError('start failed', error),
    );
  });
  const receive = (traffic: Traffic) => {
    if (live) {
      live(traffic);
      return;
    }
    held.push(traffic);
    if (!found) probe.accept(traffic);
  };
  return { receive, started: startedPromise };
}
