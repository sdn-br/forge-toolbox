// Until the profile is known, nothing knows which profile to load, so the traffic waits here and goes through in its
// order once the profile has started. Reading the profile from the traffic is the game's part, handed in as `identify`.
import type { Profile } from '../../shared/profile';
import type { Traffic } from '../../shared/proxy-protocol';
import { logError } from './log';

export interface StartupGate {
  /** the receiver for the proxy */
  receive: (traffic: Traffic) => void;
  /** settles once the held traffic went through and the traffic flows live */
  started: Promise<void>;
}

/**
 * `identify` names the profile (the own player name comes along) once a traffic holds it. `start` loads the profile and
 * resolves to the receiver of the live traffic, which then gets the held traffic first, in order, and everything after
 * it.
 */
export function startupGate(
  identify: (traffic: Traffic) => { profile: Profile; name: string } | null,
  start: (profile: Profile, name: string) => Promise<(traffic: Traffic) => void>,
): StartupGate {
  const held: Traffic[] = [];
  let live: ((traffic: Traffic) => void) | null = null;
  let found = false;
  let started: () => void = () => {};
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const receive = (traffic: Traffic) => {
    if (live) {
      live(traffic);
      return;
    }
    held.push(traffic);
    if (found) return;
    const identity = identify(traffic);
    if (!identity) return;
    found = true;
    start(identity.profile, identity.name).then(
      (receive) => {
        // traffic that came while loading waits here too; the loop and the switch run in one go, so nothing overtakes
        for (const traffic of held.splice(0)) receive(traffic);
        live = receive;
        started();
      },
      (error) => logError('start failed', error),
    );
  };
  return { receive, started: startedPromise };
}
