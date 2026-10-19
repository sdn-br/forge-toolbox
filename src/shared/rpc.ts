// Typed calls from the content script to the service worker, which owns the database.
import type { PlayerId, WorldId } from './ids';
import type { Battle, Player } from './model';

export interface BackgroundApi {
  'players.load': { arg: { world: WorldId }; result: Player[] };
  'players.put': { arg: { rows: Player[] }; result: undefined };
  'battles.put': { arg: { rows: Battle[] }; result: undefined };
  'battles.latest': { arg: { world: WorldId; opponent: PlayerId }; result: Battle | null };
  'battles.list': {
    arg: { world: WorldId; opponents?: PlayerId[]; limit: number; offset: number };
    result: Battle[];
  };
  'battles.count': { arg: { world: WorldId; opponents?: PlayerId[] }; result: number };
  'battles.prune': { arg: { before: number }; result: number };
}

export type Method = keyof BackgroundApi;
export type Arg<M extends Method> = BackgroundApi[M]['arg'];
export type Result<M extends Method> = BackgroundApi[M]['result'];

export interface RpcRequest<M extends Method = Method> {
  rpc: M;
  arg: Arg<M>;
}

export type RpcResponse<M extends Method = Method> = { ok: true; result: Result<M> } | { ok: false; error: string };
