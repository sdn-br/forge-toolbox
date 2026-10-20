// Turns raw proxy traffic into game messages and routes them to exactly the handlers registered for them.
import type { Traffic } from '../../shared/proxy-protocol';
import { logError } from './log';

export interface GameMessage {
  service: string;
  method: string;
  data: unknown;
  /** `requestData` of the request with the same service and method, when the response answers one */
  request?: unknown;
  via: 'json' | 'ws';
}

export interface MetaFile {
  name: string;
  hash: string;
  json: unknown;
  raw: string;
}

type GameHandler = (message: GameMessage) => void;
type MetaHandler = (file: MetaFile) => void;

// The game expects this one first, everything else builds on the session it creates.
const FIRST = 'StartupService.getData';

export class Ingestion {
  private game = new Map<string, GameHandler[]>();
  private services = new Map<string, GameHandler[]>();
  private meta: { prefix: string; handler: MetaHandler }[] = [];
  private batchEnds: (() => void)[] = [];

  on(service: string, method: string, handler: GameHandler): void {
    const key = `${service}.${method}`;
    this.game.set(key, [...(this.game.get(key) ?? []), handler]);
  }

  /** every method of a service, for responses whose method is not known in advance */
  onService(service: string, handler: GameHandler): void {
    this.services.set(service, [...(this.services.get(service) ?? []), handler]);
  }

  /** after all entries of one game response, for things the game splits over several entries of it */
  onBatchEnd(handler: () => void): void {
    this.batchEnds.push(handler);
  }

  onMeta(prefix: string, handler: MetaHandler): void {
    this.meta.push({ prefix, handler });
  }

  accept(traffic: Traffic): void {
    if (traffic.kind === 'meta') {
      this.acceptMeta(traffic.url, traffic.response);
      return;
    }
    const entries = parseEntries(traffic.kind === 'json' ? traffic.response : traffic.data);
    const requests = new Map<string, unknown>();
    if (traffic.kind === 'json' && traffic.request) {
      for (const r of parseEntries(traffic.request)) if (!requests.has(key(r))) requests.set(key(r), r.requestData);
    }
    entries.sort((a, b) => Number(key(b) === FIRST) - Number(key(a) === FIRST));
    for (const entry of entries) {
      const handlers = [...(this.game.get(key(entry)) ?? []), ...(this.services.get(entry.requestClass) ?? [])];
      if (handlers.length === 0) continue;
      const message: GameMessage = {
        service: entry.requestClass,
        method: entry.requestMethod,
        data: entry.responseData,
        request: requests.get(key(entry)),
        via: traffic.kind,
      };
      for (const handler of handlers) this.run(key(entry), () => handler(message));
    }
    for (const handler of this.batchEnds) this.run('batch end', handler);
  }

  private acceptMeta(url: string, response: string): void {
    const id = metaId(url);
    if (!id) return;
    const handlers = this.meta.filter((m) => id.name.startsWith(m.prefix));
    if (handlers.length === 0) return;
    let json: unknown;
    try {
      json = JSON.parse(response);
    } catch {
      return;
    }
    for (const { handler } of handlers) this.run(id.name, () => handler({ ...id, json, raw: response }));
  }

  private run(what: string, work: () => void) {
    try {
      work();
    } catch (error) {
      logError(`handler for ${what} failed`, error);
    }
  }
}

interface Entry {
  requestClass: string;
  requestMethod: string;
  responseData?: unknown;
  requestData?: unknown;
}

const key = (e: Entry) => `${e.requestClass}.${e.requestMethod}`;

function parseEntries(text: string): Entry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((e): e is Entry => typeof e?.requestClass === 'string' && typeof e?.requestMethod === 'string');
}

/** `.../metadata?id=building_entity_X_Foo-3f2a…` → name `building_entity_X_Foo`, hash `3f2a…` */
export function metaId(url: string): { name: string; hash: string } | null {
  const id = new URL(url, 'https://x.invalid').searchParams.get('id');
  const cut = id?.lastIndexOf('-') ?? -1;
  if (!id || cut <= 0) return null;
  return { name: id.slice(0, cut), hash: id.slice(cut + 1) };
}
