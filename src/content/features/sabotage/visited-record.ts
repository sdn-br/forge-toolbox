// What is recorded about the visited player, loaded from the stores whenever the visit or the records change.
import type { PlayerId } from '../../../shared/ids';
import type { FeatureContext } from '../../core/feature';
import { logError } from '../../core/log';
import type { VisitedRecord } from './view-model';

type Part = keyof VisitedRecord;

interface Loader<K extends Part> {
  load(owner: PlayerId): Promise<VisitedRecord[K]>;
  failed: string;
  /** calls `reload` with the players whose records of this kind changed */
  onRecorded(reload: (players: readonly PlayerId[]) => void): void;
}

type Loaders = { [K in Part]: Loader<K> };

/**
 * Keeps each part tagged with the player it was loaded for, so a part of a player who is no longer visited never
 * shows, not even when its response comes in after the next visit. Each part also counts its loads: a response
 * older than the last one applied is dropped, so a slow older answer never overwrites a newer one.
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
  // each part with the player it was loaded for
  const loaded: VisitedRecord = {};
  const loadedFor: { [K in Part]?: PlayerId } = {};
  const asked: { [K in Part]?: number } = {};
  const visitedOwner = () => ctx.cities.visited()?.owner;

  const load = <K extends Part>(key: K, owner: PlayerId) => {
    const loader: Loader<K> = loaders[key];
    const nr = (asked[key] ?? 0) + 1;
    asked[key] = nr;
    return loader
      .load(owner)
      .then((value) => {
        if (visitedOwner() !== owner || asked[key] !== nr) return;
        loaded[key] = value;
        loadedFor[key] = owner;
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
    current(owner) {
      const record: VisitedRecord = {};
      for (const key of keys) if (loadedFor[key] === owner) Object.assign(record, { [key]: loaded[key] });
      return record;
    },
  };
}
