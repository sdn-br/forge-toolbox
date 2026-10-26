// The service worker serves every profile from its own database: opened on the first call of the profile, then kept.
import type { FoestatsDeps } from '../persistence/foestats/worker';
import { isProfile, type Profile, profileDbName } from '../shared/profile';
import type { BackgroundApi, Handlers, Method, RpcRequest, RpcResponse } from '../shared/rpc';
import type { ToolboxDb } from './db';
import { createHandlers } from './handlers';

export interface ProfileEnv {
  open: (name: string) => ToolboxDb;
  /** runs once per database before its first handler, the takeover of the old store */
  prepare: (profile: Profile, db: ToolboxDb) => Promise<void>;
  deps: FoestatsDeps;
  logError: (what: string, error: unknown) => void;
}

/** a message that is an RPC; other messages, such as opening the data page, pass by */
export function isRpcRequest(message: unknown): message is RpcRequest {
  const m = message as Partial<RpcRequest> | null;
  return typeof m?.rpc === 'string' && isProfile(m.profile);
}

export function profileDispatch(env: ProfileEnv): (req: RpcRequest) => Promise<RpcResponse> {
  const handlers = new Map<string, Promise<Handlers<BackgroundApi>>>();
  // one takeover at a time: two profiles on the same world must not both copy its rows
  let queue: Promise<unknown> = Promise.resolve();

  const handlersOf = (profile: Profile) => {
    const name = profileDbName(profile);
    let ready = handlers.get(name);
    if (!ready) {
      const db = env.open(name);
      const prepared = queue.then(() =>
        // a failed takeover leaves the old rows where they are and runs again on the next start of the worker
        env.prepare(profile, db).catch((error) => env.logError(`taking over the old data of ${name} failed`, error)),
      );
      queue = prepared;
      ready = prepared.then(() => createHandlers(db, env.deps));
      handlers.set(name, ready);
    }
    return ready;
  };

  return async (req) => {
    try {
      const handler = (await handlersOf(req.profile))[req.rpc] as ((arg: unknown) => Promise<unknown>) | undefined;
      if (!handler) return { ok: false, error: `unknown call ${req.rpc}` };
      return { ok: true, result: await handler(req.arg) } as RpcResponse<Method>;
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  };
}
