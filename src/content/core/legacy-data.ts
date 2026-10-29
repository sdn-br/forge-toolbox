// The data of the old toolbox as a source of the dialog "Gefundene Daten": read from the game page, mapped to the
// backup tables and offered with the rows the profile does not hold yet. Offered at the start once per profile until
// answered, also when the profile has data. Taking merges after the backup copy, so that one is the stored state.
import type { BackupProfile } from '../../backup/format';
import { mapToolbox1, mapToolbox2 } from '../../backup/legacy/mapper';
import type { Area } from '../../backup/merge';
import type { BackupPersistence } from '../../persistence/backup/client';
import type { Profile } from '../../shared/profile';
import { answeredLaterToday } from '../../shared/time';
import type { FoundOffer } from './backup-copy';
import type { KeyValue } from './kv';
import type { LegacyStore } from './legacy-store';
import { logInfo } from './log';

/** the answer about the old data, in the profile's storage */
export const LEGACY_ANSWER = 'legacy.answer';

/** the fingerprint of old data that held nothing the profile lacked; read again only once it changes */
const LEGACY_SEEN = 'legacy.seen';

/** "Nein" and taken: never offered again at the start. "Später": not again on the same day. */
type Answer = { answer: 'no' } | { answer: 'taken' } | { answer: 'later'; at: number };

export interface LegacyEnv {
  profile: Profile;
  /** the profile's keys in chrome.storage.local */
  kv: KeyValue;
  persistence: BackupPersistence;
  store: LegacyStore;
  now: () => number;
}

const MAPPERS = { '2.x': mapToolbox2, '1.x': mapToolbox1 } as const;

export class LegacyData {
  constructor(private env: LegacyEnv) {}

  /**
   * The old data of the profile as an offer, counted by what the profile lacks, or undefined without any. What the
   * mapper could not map goes to the console: the dialog closes with a reload after taking, so it has no place to
   * show it.
   */
  async find(): Promise<FoundOffer | undefined> {
    const { store, profile, persistence, now } = this.env;
    const found = await store.read(profile.player);
    if (!found) return undefined;
    const { tables, unmapped } = MAPPERS[found.version](found.dump, profile, now());
    if (unmapped > 0) logInfo(`old toolbox ${found.version}: ${unmapped} rows could not be mapped and stay out`);
    const entry: BackupProfile = { world: profile.world, player: profile.player, tables };
    const counts = await persistence.legacyCounts(entry);
    return {
      source: 'legacy',
      version: found.version,
      choice: {
        profile: entry,
        importable: true,
        counts,
        checked: { pvp: counts.pvp > 0, notes: counts.notes > 0, greatBuildings: false, settings: false },
      },
    };
  }

  /**
   * At the start: the offer while the question is open and the old data hold rows the profile lacks. Old data that
   * held none are not read again until their row counts change, as when the old toolbox keeps recording beside.
   */
  async offerAtStart(): Promise<FoundOffer[]> {
    const { kv, store, profile, now } = this.env;
    const answer = await kv.get<Answer | null>(LEGACY_ANSWER);
    if (answer?.answer === 'no' || answer?.answer === 'taken') return [];
    if (answeredLaterToday(answer, now())) return [];
    const fingerprint = await store.fingerprint(profile.player);
    if (!fingerprint || fingerprint === (await kv.get<string>(LEGACY_SEEN))) return [];
    const offer = await this.find();
    if (offer && Object.values(offer.choice.counts).some((n) => n > 0)) return [offer];
    await kv.set(LEGACY_SEEN, fingerprint);
    return [];
  }

  /** merges the chosen areas, the known rows left out; the question is answered */
  async take(offer: FoundOffer, areas: ReadonlySet<Area>): Promise<void> {
    const data = [...areas].filter((a) => a !== 'settings');
    if (data.length) await this.env.persistence.mergeLegacy(offer.choice.profile, data);
    await this.env.kv.set(LEGACY_ANSWER, { answer: 'taken' } satisfies Answer);
  }

  async decline(): Promise<void> {
    await this.env.kv.set(LEGACY_ANSWER, { answer: 'no' } satisfies Answer);
  }

  async later(): Promise<void> {
    await this.env.kv.set(LEGACY_ANSWER, { answer: 'later', at: this.env.now() } satisfies Answer);
  }
}
