import type { Arg, Method, Result, RpcRequest, RpcResponse } from '../../shared/rpc';

export type Call = <M extends Method>(rpc: M, arg: Arg<M>) => Promise<Result<M>>;

export const callBackground: Call = async (rpc, arg) => {
  const res: RpcResponse | undefined = await chrome.runtime.sendMessage({ rpc, arg } satisfies RpcRequest);
  if (!res) throw new Error(`no response for ${rpc}`);
  if (!res.ok) throw new Error(res.error);
  return res.result as never;
};
