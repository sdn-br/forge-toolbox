import type { Profile } from '../../shared/profile';
import type { Arg, Method, Result, RpcRequest, RpcResponse } from '../../shared/rpc';
import { assertAlive } from './extension-context';

export type Call = <M extends Method>(rpc: M, arg: Arg<M>) => Promise<Result<M>>;

/** calls into the database of `profile`; the stores get the bound call and never name the profile themselves */
export function backgroundCall(profile: Profile): Call {
  return async (rpc, arg) => {
    assertAlive();
    const res: RpcResponse | undefined = await chrome.runtime.sendMessage({ profile, rpc, arg } satisfies RpcRequest);
    if (!res) throw new Error(`no response for ${rpc}`);
    if (!res.ok) throw new Error(res.error);
    return res.result as never;
  };
}
