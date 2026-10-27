// The backup copy on the game page: written half a minute after the last change of backed up data, and offered back
// at the start when the extension has no data for the profile (reinstalled, storage cleared) but a copy exists.
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
  type BackupProfile,
  type BackupTables,
} from '../../backup/format';
import { gzipJson } from '../../backup/gzip';
import { areaCounts, type ImportChoice, importChoices, readBackupFile } from '../../backup/import';
import type { Area } from '../../backup/merge';
import type { BackupPersistence } from '../../persistence/backup/client';
import type { Profile } from '../../shared/profile';
import type { CopyStore } from './backup-store';
import type { ToolboxBus } from './events';
import type { KeyValue } from './kv';
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

/** where found data come from; the data of the old toolbox join later as a source of their own */
export type FoundSource = 'backupCopy';

/** Found data of the profile, as the dialog offers them. */
export interface FoundOffer {
  source: FoundSource;
  /** when the data were written */
  createdAt: number;
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
}

const isEmpty = (tables: BackupTables) => Object.values(tables).every((rows) => rows.length === 0);

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

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
      if (key !== BACKUP_SETTING) changed();
      else if (this.enabled()) changed();
      else this.switchedOff().catch((error) => logError('deleting the backup copy failed', error));
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
   * an offer waits for its answer, nothing is written.
   */
  start(): Promise<FoundOffer[]> {
    const run = this.offerAtStart();
    this.checked = run.catch(() => undefined);
    return run;
  }

  /** "Gefundene Daten übernehmen": the copy of the profile, also when the profile has data */
  async find(): Promise<FoundOffer[]> {
    const offer = await this.read();
    return offer ? [offer] : [];
  }

  /**
   * "Übernehmen": merges the chosen areas of each offer in order, stores the chosen settings and reloads the game.
   * Writing resumes, the profile has its data back.
   */
  async take(items: { offer: FoundOffer; areas: ReadonlySet<Area> }[]): Promise<void> {
    const { persistence, kv } = this.env;
    for (const { offer, areas } of items) {
      const entry = offer.choice.profile;
      const data = [...areas].filter((a) => a !== 'settings');
      if (data.length) await persistence.merge(entry, data);
      if (areas.has('settings') && entry.settings) await kv.set('settings', entry.settings);
    }
    this.held = false;
    await kv.set(ANSWER, null);
    this.env.reload();
  }

  /** "Nein": never offered again for the profile; the copy may be overwritten from now on */
  async decline(): Promise<void> {
    this.held = false;
    await this.env.kv.set(ANSWER, { answer: 'no' } satisfies Answer);
  }

  /** "Später": offered again at the next start of another day; until answered the copy stays as it is */
  async later(): Promise<void> {
    await this.env.kv.set(ANSWER, { answer: 'later', at: this.env.now() } satisfies Answer);
  }

  private async offerAtStart(): Promise<FoundOffer[]> {
    const { kv, persistence, profile, now } = this.env;
    const offer = await this.read();
    if (!offer) return [];
    const answer = await kv.get<Answer | null>(ANSWER);
    if (answer?.answer === 'no') return [];
    if (!answer && !isEmpty(await persistence.tables(profile.world))) return [];
    this.held = true;
    if (answer?.answer === 'later' && sameDay(answer.at, now())) return [];
    await kv.set(ANSWER, { answer: 'open' } satisfies Answer);
    return [offer];
  }

  /** the stored copy of the profile as an offer; a copy that cannot be read counts as none */
  private async read(): Promise<FoundOffer | undefined> {
    const { store, profile, kv } = this.env;
    const stored = await store.get(profile);
    if (!stored) return undefined;
    const read = await readBackupFile(new Blob([stored.file]));
    if (!read.ok) {
      logError('reading the backup copy failed', read.error);
      return undefined;
    }
    const entry = read.backup.profiles.find((p) => p.world === profile.world && p.player === profile.player);
    if (!entry) return undefined;
    const hasSettings = (await kv.get('settings')) !== undefined;
    const [choice] = importChoices({ ...read.backup, profiles: [entry] }, () => hasSettings);
    return choice && { source: 'backupCopy', createdAt: read.backup.createdAt, choice };
  }

  private changed() {
    if (!this.enabled()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.writing = this.writing
        .then(() => this.write())
        .catch((error) => logError('writing the backup copy failed', error));
    }, BACKUP_DELAY);
  }

  private async write() {
    await this.checked;
    if (this.held || !this.enabled()) return;
    const { persistence, kv, profile, name, store, now } = this.env;
    const [tables, settings] = await Promise.all([
      persistence.tables(profile.world),
      kv.get<Record<string, unknown>>('settings'),
    ]);
    const entry: BackupProfile = { ...profile, ...(name && { name }), ...(settings && { settings }), tables };
    const json = JSON.stringify(entry);
    if (json === this.last) return;
    const createdAt = now();
    const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, profiles: [entry] };
    const packed = await (await gzipJson(file)).arrayBuffer();
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
