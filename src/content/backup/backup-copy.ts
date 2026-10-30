// The backup copy on the game page: written half a minute after the last change of backed up data, and offered back
// at the start when the extension has no data for the profile (reinstalled, storage cleared) but a copy exists. It is
// the first source of the dialog "Gefundene Daten".
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
  type BackupProfile,
  type BackupTables,
} from '../../backup/format';
import { gzipJson } from '../../backup/gzip';
import { areaCounts, importChoices, profileEntry, readBackupFile } from '../../backup/import';
import type { Area } from '../../backup/merge';
import type { BackupPersistence } from '../../persistence/backup/client';
import type { Profile } from '../../shared/profile';
import { answeredLaterToday } from '../../shared/time';
import type { KeyValue } from '../core/kv';
import { logError } from '../core/log';
import { type Setting, type Settings, toggleDef } from '../core/settings';
import type { CopyStore } from './backup-store';
import type { FoundDataSource, FoundOffer } from './found-data';

/** the setting "Sicherungskopie auf der Spielseite" */
export const BACKUP_SETTING = toggleDef({
  key: 'core.backupCopy',
  group: 'settings.core',
  label: 'settings.backupCopy',
  hint: 'settings.backupCopyHint',
  default: true,
});
/** how long after the last change the copy is written */
export const BACKUP_DELAY = 30_000;
/** the answer to a found copy, in the profile's storage */
const ANSWER = 'backup.answer';

/**
 * "Nein": never ask again. "Später": ask at the next start of another day. "open": the dialog was shown and not
 * answered, ask at the next start. Each but "Nein" holds the copy, also once the profile has data again.
 */
type Answer = { answer: 'no' } | { answer: 'later'; at: number } | { answer: 'open' };

export interface BackupCopyEnv {
  profile: Profile;
  /** the own player name, stored with the copy like the export does */
  name: string;
  /** the service worker's signal that rows the copy holds changed, with the profile's change number */
  onPersisted(fn: (change: number) => void): void;
  settings: Settings;
  /** the profile's keys in chrome.storage.local */
  kv: KeyValue;
  persistence: BackupPersistence;
  store: CopyStore;
  now: () => number;
}

/** the change number of the rows (unknown before the first signal) and the count of setting changes */
interface CopyState {
  change: number | undefined;
  settings: number;
}

const sameState = (a: CopyState, b: CopyState | undefined) =>
  b !== undefined && a.change === b.change && a.settings === b.settings;

const isEmpty = (tables: BackupTables) => Object.values(tables).every((rows) => rows.length === 0);

export class BackupCopy implements FoundDataSource {
  readonly id = 'backupCopy';
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** a found copy waits for an answer: nothing is written, the near empty new state must not overwrite it */
  private held = false;
  /** the start check; a write waits for it */
  private checked: Promise<unknown> = Promise.resolve();
  private writing: Promise<unknown> = Promise.resolve();
  /**
   * what the data are at: the change number the service worker signalled last, and a count of the setting changes,
   * which the signal leaves out
   */
  private state: CopyState = { change: undefined, settings: 0 };
  /** the state the copy written last holds, to skip a write that would store the same */
  private written: CopyState | undefined;
  private listeners: (() => void)[] = [];

  private setting: Setting<boolean>;

  constructor(private env: BackupCopyEnv) {
    this.setting = env.settings.register(BACKUP_SETTING);
  }

  /**
   * Listens for changes of backed up data: the rows of the export, which the service worker signals, and the settings.
   */
  watch(): void {
    this.env.onPersisted((change) => {
      this.state = { ...this.state, change };
      this.changed();
    });
    this.env.settings.onChange((key) => {
      if (key === BACKUP_SETTING.key && !this.enabled())
        this.switchedOff().catch((error) => logError('deleting the backup copy failed', error));
      // the setting itself is a setting the copy holds
      this.state = { ...this.state, settings: this.state.settings + 1 };
      this.changed();
    });
  }

  /** the copy was written anew or deleted */
  onChanged(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** settles once the write started last is done */
  idle(): Promise<void> {
    return this.writing.then(() => undefined);
  }

  enabled(): boolean {
    return this.setting.get();
  }

  /**
   * At the start of the game: the copy to offer, if any. A copy is offered when the profile has no rows the export
   * would hold, or when an earlier offer was not answered with "Nein"; after "Später" not again on the same day. While
   * an offer waits for its answer, nothing is written. Without any copy of the profile the first one is written at
   * once, so a profile with data has a copy before its first change.
   */
  async offerAtStart(): Promise<FoundOffer[]> {
    const run = this.check();
    this.checked = run.catch(() => undefined);
    const { offers, exists } = await run;
    if (!this.held && this.enabled() && !(exists ?? (await this.env.store.get(this.env.profile)))) this.writeNow();
    return offers;
  }

  /** the copy of the profile, also when the profile has data */
  async find(): Promise<FoundOffer | undefined> {
    return (await this.read()).offer;
  }

  /** merges the chosen areas of the copy and stores its settings, if chosen; writing resumes, the data are back */
  async take(offer: FoundOffer, areas: ReadonlySet<Area>): Promise<void> {
    const entry = offer.choice.profile;
    const data = [...areas].filter((a) => a !== 'settings');
    if (data.length) await this.env.persistence.merge(entry, data);
    if (areas.has('settings') && entry.settings) await this.env.settings.replace(entry.settings);
    this.held = false;
    await this.env.kv.set(ANSWER, null);
  }

  /** "Nein": the copy is never offered again for the profile and may be overwritten from now on */
  async decline(): Promise<void> {
    this.held = false;
    await this.env.kv.set(ANSWER, { answer: 'no' } satisfies Answer);
  }

  /** "Später": offered again at the next start of another day; until answered the copy stays as it is */
  async later(): Promise<void> {
    await this.env.kv.set(ANSWER, { answer: 'later', at: this.env.now() } satisfies Answer);
  }

  /** `exists`: whether a stored copy was found, undefined when it was not looked for */
  private async check(): Promise<{ offers: FoundOffer[]; exists?: boolean }> {
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
    if (!this.enabled()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeNow(), BACKUP_DELAY);
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
    // taken before reading: a change while the rows are read moves the state on, and the next write takes it
    const state = this.state;
    if (sameState(state, this.written)) return;
    const { persistence, profile, name, store, now } = this.env;
    const tables = await persistence.tables(profile.world);
    const settings = this.env.settings.stored();
    const entry: BackupProfile = { ...profile, ...(name && { name }), ...(settings && { settings }), tables };
    const createdAt = now();
    const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, profiles: [entry] };
    const packed = await (await gzipJson(file)).arrayBuffer();
    // switched off meanwhile: the copy is gone and stays gone
    if (this.held || !this.enabled()) return;
    await store.put({ ...profile, createdAt, counts: areaCounts(entry), file: packed });
    this.written = state;
    for (const fn of this.listeners) fn();
  }

  /** deletes the copy and forgets a question about it; nothing is written until switched on again */
  private async switchedOff() {
    clearTimeout(this.timer);
    this.held = false;
    this.written = undefined;
    await this.writing;
    await this.env.store.delete(this.env.profile);
    await this.env.kv.set(ANSWER, null);
    for (const fn of this.listeners) fn();
  }
}
