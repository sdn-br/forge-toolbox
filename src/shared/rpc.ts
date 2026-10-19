// Typed calls from the content script to the service worker, which owns the database.
import type { WorldId } from './ids';
import type { Player } from './model';

export interface BackgroundApi {
  'players.load': { arg: { world: WorldId }; result: Player[] };
  'players.put': { arg: { rows: Player[] }; result: undefined };
}

export type Method = keyof BackgroundApi;
export type Arg<M extends Method> = BackgroundApi[M]['arg'];
export type Result<M extends Method> = BackgroundApi[M]['result'];

export interface RpcRequest<M extends Method = Method> {
  rpc: M;
  arg: Arg<M>;
}

export type RpcResponse<M extends Method = Method> = { ok: true; result: Result<M> } | { ok: false; error: string };
