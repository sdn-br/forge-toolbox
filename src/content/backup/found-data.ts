// The dialog "Gefundene Daten" offers data of the profile from several sources: the backup copy on the game page,
// then the databases of the old toolbox. Each source keeps its own answer; this asks them in their order and hands each
// its part of an answer.
import type { ImportChoice } from '../../backup/import';
import type { LegacyVersion } from '../../backup/legacy/types';
import type { Area } from '../../backup/merge';
import { logError } from '../core/log';

/** where found data come from: the own backup copy, or the databases of the old toolbox */
export type FoundSource = 'backupCopy' | 'legacy';

/** Found data of the profile, as the dialog offers them. */
export interface FoundOffer {
  source: FoundSource;
  /** when the backup copy was written; the old toolbox does not say */
  createdAt?: number;
  /** the version of the old toolbox */
  version?: LegacyVersion;
  /** the profile entry with its counts and preselected areas */
  choice: ImportChoice;
}

/** One source of found data. */
export interface FoundDataSource {
  id: FoundSource;
  /** what an extra source holds, for the console: when looking for its data fails, the offers of the others stay */
  extra?: string;
  /** what to offer at the start of the game, after its own answer */
  offerAtStart(): Promise<FoundOffer[]>;
  /** "Gefundene Daten übernehmen": its data, also when the profile has data */
  find(): Promise<FoundOffer | undefined>;
  /** merges the chosen areas, at least one, of its offer */
  take(offer: FoundOffer, areas: ReadonlySet<Area>): Promise<void>;
  /** "Nein" */
  decline(): Promise<void>;
  /** "Später" */
  later(): Promise<void>;
}

export class FoundData {
  /** `sources` in the order of the dialog and of taking; `reload` restarts the game page, so the stores load the data */
  constructor(
    private sources: readonly FoundDataSource[],
    private reload: () => void,
  ) {}

  /** At the start of the game: the offers of all sources, looked for at once. */
  start(): Promise<FoundOffer[]> {
    return Promise.all(this.sources.map((s) => this.guard(s, s.offerAtStart(), []))).then((found) => found.flat());
  }

  /** "Gefundene Daten übernehmen": the data of every source, also when the profile has data */
  async find(): Promise<FoundOffer[]> {
    const found = await Promise.all(this.sources.map((s) => this.guard(s, s.find(), undefined)));
    return found.filter((o) => o !== undefined);
  }

  /**
   * "Übernehmen": merges the chosen areas of each offer in the order of the sources and reloads the game. An offer
   * without any chosen area counts as "Nein" for its source.
   */
  async take(items: { offer: FoundOffer; areas: ReadonlySet<Area> }[]): Promise<void> {
    for (const source of this.sources)
      for (const { offer, areas } of items.filter((item) => item.offer.source === source.id)) {
        if (areas.size === 0) await source.decline();
        else await source.take(offer, areas);
      }
    this.reload();
  }

  /** "Nein" for the sources shown */
  async decline(ids: readonly FoundSource[]): Promise<void> {
    for (const source of this.shown(ids)) await source.decline();
  }

  /** "Später" for the sources shown */
  async later(ids: readonly FoundSource[]): Promise<void> {
    for (const source of this.shown(ids)) await source.later();
  }

  private shown(ids: readonly FoundSource[]) {
    return this.sources.filter((s) => ids.includes(s.id));
  }

  private guard<T, F>(source: FoundDataSource, found: Promise<T>, fallback: F): Promise<T | F> {
    if (!source.extra) return found;
    return found.catch((error) => {
      logError(`looking for ${source.extra} failed`, error);
      return fallback;
    });
  }
}
