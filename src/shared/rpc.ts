// Typed calls from the content script to the service worker, which owns the database.
// Each stored domain declares its calls in src/persistence/<domain>/contract.ts.
import type { BattlesApi } from '../persistence/battles/contract';
import type { FoestatsApi } from '../persistence/foestats/contract';
import type { GreatBuildingsApi } from '../persistence/great-buildings/contract';
import type { IncomingApi } from '../persistence/incoming/contract';
import type { NotesApi } from '../persistence/notes/contract';
import type { PlayersApi } from '../persistence/players/contract';
import type { PlundersApi } from '../persistence/plunders/contract';
import type { ShieldsApi } from '../persistence/shields/contract';
import type { Profile } from './profile';

export interface BackgroundApi
  extends PlayersApi,
    BattlesApi,
    PlundersApi,
    IncomingApi,
    NotesApi,
    ShieldsApi,
    GreatBuildingsApi,
    FoestatsApi {}

export type Method = keyof BackgroundApi;
export type Arg<M extends Method> = BackgroundApi[M]['arg'];
export type Result<M extends Method> = BackgroundApi[M]['result'];

export type Handlers<A extends { [M in keyof A]: { arg: unknown; result: unknown } }> = {
  [M in keyof A]: (arg: A[M]['arg']) => Promise<A[M]['result']>;
};

export interface RpcRequest<M extends Method = Method> {
  /** whose database the call goes to */
  profile: Profile;
  rpc: M;
  arg: Arg<M>;
}

export type RpcResponse<M extends Method = Method> = { ok: true; result: Result<M> } | { ok: false; error: string };
