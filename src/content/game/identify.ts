// The world is in the address, the own player id only in the startup data. This reads the profile from the traffic,
// so the startup gate knows when to start without knowing the game format.
import type { WorldId } from '../../shared/ids';
import type { Profile } from '../../shared/profile';
import type { Traffic } from '../../shared/proxy-protocol';
import { Ingestion } from '../core/ingestion';
import { toSession } from './convert';
import type { GameStartup } from './game-types';

/** the own profile and player name, as the startup data name them */
export interface Identity {
  profile: Profile;
  name: string;
}

/** Reads one traffic: the identity when it holds startup data with a player id, else null. */
export function identifyStartup(world: WorldId): (traffic: Traffic) => Identity | null {
  let found: Identity | null = null;
  const probe = new Ingestion();
  probe.on('StartupService', 'getData', ({ data }) => {
    const session = toSession(world, (data as GameStartup).user_data);
    if (session && !found) found = { profile: { world, player: session.playerId }, name: session.name };
  });
  return (traffic) => {
    found = null;
    probe.accept(traffic);
    return found;
  };
}
