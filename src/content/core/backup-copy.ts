// The backup copy on the game page: written half a minute after the last change of backed up data, and offered back
// at the start when the extension has no data for the profile (reinstalled, storage cleared) but a copy exists. The
// found data of the dialog "Gefundene Daten" go through here: the copy first, then the old toolbox data.
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
  type BackupProfile,
  type BackupTables,
} from '../../backup/format';
import { gzipText } from '../../backup/gzip';
import { areaCounts, type ImportChoice, importChoices, profileEntry, readBackupFile } from '../../backup/import';
import type { LegacyVersion } from '../../backup/legacy/types';
import type { Area } from '../../backup/merge';
import type { BackupPersistence } from '../../persistence/backup/client';
import type { Profile } from '../../shared/profile';
import { answeredLaterToday } from '../../shared/time';
import type { CopyStore } from './backup-store';
import type { ToolboxBus } from './events';
import type { KeyValue } from './kv';
import type { LegacyData } from './legacy-data';
import { logError } from './log';
import type { Settings } from './settings';

/** the setting "Sicherungskopie auf der Spielseite" */
export const BACKUP_SETTING = 'core.backupCopy';
/** how long after the last change the copy is written */
export const BACKUP_DELAY = 30_000;
/** the answer to a found copy, in the profile's storage */
const ANSWER = 'backup.answer';

/**
 * "Nein": never ask again. "Später": ask at the next start of another day. "open": the dialog was shown and not
 * answered, ask at the next start. Each but "Nein" holds the copy, also once the profile has data again.
 */
type Answer = { answer: 'no' } | { answer: 'later'; at: number } | { answer: 'open' };

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

export interface BackupCopyEnv {
  profile: Profile;
  /** the own player name, stored with the copy like the export does */
  name: string;
  bus: ToolboxBus;
  settings: Settings;
  /** the profile's keys in chrome.storage.local */
  kv: KeyValue;
  persistence: BackupPersistence;
  store: CopyStore;
  now: () => number;
  /** restarts the game page after taking data, so the stores load them */
  reload: () => void;
  /** the data of the old toolbox, offered after the copy */
  legacy?: LegacyData;
  /**
   * asks the service worker to write the backup in a local folder; called on the same delay as the copy, also when
   * the copy is switched off or held
   */
  folder?: () => void;
}

const isEmpty = (tables: BackupTables) => Object.values(tables).every((rows) => rows.length === 0);

export class BackupCopy {
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** a found copy waits for an answer: nothing is written, the near empty new state must not overwrite it */
  private held = false;
  /** the start check; a write waits for it */
  private checked: Promise<unknown> = Promise.resolve();
  private writing: Promise<unknown> = Promise.resolve();
  /** the profile entry written last, to skip a write that would store the same */
  private last: string | undefined;

  constructor(private env: BackupCopyEnv) {
    env.settings.register({
      key: BACKUP_SETTING,
      group: 'settings.core',
      label: 'settings.backupCopy',
      hint: 'settings.backupCopyHint',
      default: true,
      ownControl: true,
    });
  }

  /** Listens for changes of backed up data: rows of the export and the settings. */
  watch(): void {
    const { bus } = this.env;
    const changed = () => this.changed();
    bus.on('battle.recorded', changed);
    bus.on('plunder.recorded', changed);
    bus.on('incoming.recorded', changed);
    bus.on('shield.recorded', changed);
    bus.on('note.changed', changed);
    // other updates of players are game data; a player goes into the copy only with a row or a mark
    bus.on('player.updated', ({ source }) => (source === 'mark' || source === 'ignore') && changed());
    bus.on('greatBuilding.marked', changed);
    bus.on('greatBuilding.ignored', changed);
    bus.on('greatBuilding.changed', ({ reason }) => reason === 'contributed' && changed());
    bus.on('greatBuildings.contributions', changed);
    this.env.settings.onChange((key) => {
      if (key === BACKUP_SETTING && !this.enabled())
        this.switchedOff().catch((error) => logError('deleting the backup copy failed', error));
      // the setting itself is a setting the folder backs up
      changed();
    });
  }

  /** settles once the write started last is done */
  idle(): Promise<void> {
    return this.writing.then(() => undefined);
  }

  enabled(): boolean {
    return this.env.settings.get(BACKUP_SETTING);
  }

  /**
   * At the start of the game: the copy to offer, if any. A copy is offered when the profile has no rows the export
   * would hold, or when an earlier offer was not answered with "Nein"; after "Später" not again on the same day. While
   * an offer waits for its answer, nothing is written. Without any copy of the profile the first one is written at
   * once, so a profile with data has a copy before its first change.
   */
  start(): Promise<FoundOffer[]> {
    // the old data are independent of the copy: look for both at once
    const legacy = this.legacyOr(this.env.legacy?.offerAtStart(), []);
    const run = this.offerAtStart();
    this.checked = run.catch(() => undefined);
    const copy = run.then(async ({ offers, exists }) => {
      if (!this.held && this.enabled() && !(exists ?? (await this.env.store.get(this.env.profile)))) this.writeNow();
      return offers;
    });
    return Promise.all([copy, legacy]).then(([offers, found]) => [...offers, ...(found ?? [])]);
  }

  /** "Gefundene Daten übernehmen": the copy of the profile and the old data, also when the profile has data */
  async find(): Promise<FoundOffer[]> {
    const [{ offer }, legacy] = await Promise.all([this.read(), this.legacyOr(this.env.legacy?.find(), undefined)]);
    return [offer, legacy].filter((o) => o !== undefined);
  }

  /** the old toolbox data are an extra: when looking for them fails, the offers of the copy stay */
  private legacyOr<T, F>(found: Promise<T> | undefined, fallback: F): Promise<T | F> | undefined {
    return found?.catch((error) => {
      logError('looking for old toolbox data failed', error);
      return fallback;
    });
  }

  /**
   * "Übernehmen": merges the chosen areas of each offer in order, the copy before the old data, stores the chosen
   * settings and reloads the game. An offer without any chosen area counts as "Nein" for its source. Once the copy is
   * taken, writing resumes, the profile has its data back.
   */
  async take(items: { offer: FoundOffer; areas: ReadonlySet<Area> }[]): Promise<void> {
    const { persistence, kv, legacy } = this.env;
    const ordered = [...items].sort(
      (a, b) => Number(a.offer.source === 'legacy') - Number(b.offer.source === 'legacy'),
    );
    for (const { offer, areas } of ordered) {
      if (areas.size === 0) {
        await this.decline([offer.source]);
      } else if (offer.source === 'legacy') {
        await legacy?.take(offer, areas);
      } else {
        const entry = offer.choice.profile;
        const data = [...areas].filter((a) => a !== 'settings');
        if (data.length) await persistence.merge(entry, data);
        if (areas.has('settings') && entry.settings) await kv.set('settings', entry.settings);
        this.held = false;
        await kv.set(ANSWER, null);
      }
    }
    this.env.reload();
  }

  /**
   * "Nein" for the sources shown: the copy is never offered again for the profile and may be overwritten from now
   * on; the old data are not offered again at the start.
   */
  async decline(sources: readonly FoundSource[]): Promise<void> {
    if (sources.includes('backupCopy')) {
      this.held = false;
      await this.env.kv.set(ANSWER, { answer: 'no' } satisfies Answer);
    }
    if (sources.includes('legacy')) await this.env.legacy?.decline();
  }

  /**
   * "Später" for the sources shown: offered again at the next start of another day; until answered the copy stays as
   * it is.
   */
  async later(sources: readonly FoundSource[]): Promise<void> {
    if (sources.includes('backupCopy'))
      await this.env.kv.set(ANSWER, { answer: 'later', at: this.env.now() } satisfies Answer);
    if (sources.includes('legacy')) await this.env.legacy?.later();
  }

  /** `exists`: whether a stored copy was found, undefined when it was not looked for */
  private async offerAtStart(): Promise<{ offers: FoundOffer[]; exists?: boolean }> {
    const { kv, persistence, profile, now } = this.env;
    // the cheap answer first: after "Nein" the copy is not even unpacked
    const answer = await kv.get<Answer | null>(ANSWER);
    if (answer?.answer === 'no') return { offers: [] };
    const { offer, exists } = await this.read();
    // the copy written at the first start of an empty profile holds nothing to take
    if (!offer || !Object.values(offer.choice.counts).some((n) => n > 0)) return { offers: [], exists };
    // own settings count as data: a profile that only changed a setting wrote the copy itself, nothing is lost
    if (!answer && (this.env.settings.stored() !== undefined || !isEmpty(await persistence.tables(profile.world))))
      return { offers: [], exists };
    this.held = true;
    if (answeredLaterToday(answer, now())) return { offers: [], exists };
    await kv.set(ANSWER, { answer: 'open' } satisfies Answer);
    return { offers: [offer], exists };
  }

  /** the stored copy of the profile as an offer; a copy that cannot be read counts as none */
  private async read(): Promise<{ offer?: FoundOffer; exists: boolean }> {
    const { store, profile, settings } = this.env;
    const stored = await store.get(profile);
    if (!stored) return { exists: false };
    const read = await readBackupFile(new Blob([stored.file]));
    if (!read.ok) {
      logError('reading the backup copy failed', read.error);
      return { exists: true };
    }
    const entry = profileEntry(read.backup, profile);
    if (!entry) return { exists: true };
    const hasSettings = settings.stored() !== undefined;
    const [choice] = importChoices({ ...read.backup, profiles: [entry] }, () => hasSettings);
    return { exists: true, offer: choice && { source: 'backupCopy', createdAt: read.backup.createdAt, choice } };
  }

  private changed() {
    if (!this.enabled() && !this.env.folder) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.env.folder?.();
      if (this.enabled()) this.writeNow();
    }, BACKUP_DELAY);
  }

  /** queues a write behind the one running */
  private writeNow() {
    this.writing = this.writing
      .then(() => this.write())
      .catch((error) => logError('writing the backup copy failed', error));
  }

  private async write() {
    await this.checked;
    if (this.held || !this.enabled()) return;
    const { persistence, profile, name, store, now } = this.env;
    const tables = await persistence.tables(profile.world);
    const settings = this.env.settings.stored();
    const entry: BackupProfile = { ...profile, ...(name && { name }), ...(settings && { settings }), tables };
    const json = JSON.stringify(entry);
    if (json === this.last) return;
    const createdAt = now();
    // the file around the entry already serialized for the comparison, so it is stringified once
    const head = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt } satisfies Omit<
      BackupFile,
      'profiles'
    >);
    const packed = await (await gzipText(`${head.slice(0, -1)},"profiles":[${json}]}`)).arrayBuffer();
    // switched off meanwhile: the copy is gone and stays gone
    if (this.held || !this.enabled()) return;
    await store.put({ ...profile, createdAt, counts: areaCounts(entry), file: packed });
    this.last = json;
  }

  /** deletes the copy and forgets a question about it; nothing is written until switched on again */
  private async switchedOff() {
    clearTimeout(this.timer);
    this.held = false;
    this.last = undefined;
    await this.writing;
    await this.env.store.delete(this.env.profile);
    await this.env.kv.set(ANSWER, null);
  }
}
