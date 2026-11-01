// What is recorded about the visited player, loaded from the stores whenever the visit or the records change.
import type { PlayerId } from '../../../shared/ids';
import type { Battle, CityShield, IncomingAttack, IncomingTotals, Plunder, PlunderTotals } from '../../../shared/model';
import type { FeatureContext } from '../../core/feature';
import { logError } from '../../core/log';

/** What is recorded about the visited player; each part only once it is loaded for this player. */
export interface VisitedRecord {
  lastBattle?: Battle;
  plunders?: { last?: Plunder; totals: PlunderTotals };
  incoming?: { last?: IncomingAttack; totals: IncomingTotals };
  shield?: CityShield;
}

type Part = keyof VisitedRecord;

interface Loader<K extends Part> {
  load(owner: PlayerId): Promise<VisitedRecord[K]>;
  failed: string;
  /** calls `reload` with the players whose records of this kind changed */
  onRecorded(reload: (players: readonly PlayerId[]) => void): void;
}

type Loaders = { [K in Part]: Loader<K> };

/** The record of one visited player, with how many loads of each part were started for them. */
interface Visit {
  owner: PlayerId;
  record: VisitedRecord;
  requests: { [K in Part]?: number };
}

/**
 * Keeps the parts of the player who is visited now, so a part of a player who is no longer visited never shows, not
 * even when its response comes in after the next visit. Each part counts its loads: a response older than the last
 * one applied is dropped, so a slow older answer never overwrites a newer one.
 */
export function visitedRecord(ctx: FeatureContext, onChange: () => void): { current(owner: PlayerId): VisitedRecord } {
  const loaders: Loaders = {
    lastBattle: {
      load: (owner) => ctx.battles.latest(owner),
      failed: 'loading the last battle failed',
      onRecorded: (reload) => ctx.bus.on('battle.recorded', ({ opponent }) => reload([opponent])),
    },
    plunders: {
      load: async (owner) => {
        const [last, totals] = await Promise.all([ctx.plunders.latest(owner), ctx.plunders.totals([owner])]);
        return { last, totals };
      },
      failed: 'loading plunders failed',
      onRecorded: (reload) => ctx.bus.on('plunder.recorded', ({ opponent }) => reload([opponent])),
    },
    incoming: {
      load: async (owner) => {
        const [last, totals] = await Promise.all([ctx.incoming.latest(owner), ctx.incoming.totals([owner])]);
        return { last, totals };
      },
      failed: 'loading attacks on the own city failed',
      onRecorded: (reload) => ctx.bus.on('incoming.recorded', ({ attacker }) => reload([attacker])),
    },
    shield: {
      load: (owner) => ctx.shields.active(owner),
      failed: 'loading the city shield failed',
      onRecorded: (reload) => ctx.bus.on('shield.recorded', ({ players }) => reload(players)),
    },
  };
  let visit: Visit | undefined;
  const visitedOwner = () => ctx.cities.visited()?.owner;

  const load = <K extends Part>(key: K, owner: PlayerId) => {
    const loader: Loader<K> = loaders[key];
    if (visit?.owner !== owner) visit = { owner, record: {}, requests: {} };
    const started = visit;
    const nr = (started.requests[key] ?? 0) + 1;
    started.requests[key] = nr;
    return loader
      .load(owner)
      .then((value) => {
        if (visit !== started || visitedOwner() !== owner || started.requests[key] !== nr) return;
        started.record[key] = value;
        onChange();
      })
      .catch((error) => logError(loader.failed, error));
  };

  const keys = Object.keys(loaders) as Part[];
  ctx.bus.on('city.visited', ({ owner }) => {
    for (const key of keys) load(key, owner);
  });
  for (const key of keys) {
    loaders[key].onRecorded((players) => {
      const owner = visitedOwner();
      if (owner !== undefined && players.includes(owner)) load(key, owner);
    });
  }

  return {
    current: (owner) => (visit?.owner === owner ? { ...visit.record } : {}),
  };
}
