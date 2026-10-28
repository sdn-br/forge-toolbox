// The extension's own page "Daten verwalten": export and import of the stored data as a file, per profile, also
// without the game open. It lives in the extension origin and opens the databases itself, like the service worker.
import { html, render, type TemplateResult } from 'lit-html';
import { openDb } from '../background/db';
import {
  type BackupSource,
  closeBackupSources,
  collectBackup,
  openBackupSources,
  selectSources,
  sourceKey,
} from '../backup/collect';
import { clearFolderHandle, type FolderHandle, loadFolderHandle, saveFolderHandle } from '../backup/folder';
import { type BackupFile, backupFileName } from '../backup/format';
import { gzipJson } from '../backup/gzip';
import {
  type ImportChoice,
  type ImportCounts,
  type ImportMode,
  importBackup,
  importChoices,
  readBackupFile,
  replaceSummary,
} from '../backup/import';
import { type Area, DATA_AREAS } from '../backup/merge';
import { logError } from '../content/core/log';
import { formatFullDateTime, formatNumber, t } from '../content/core/texts';
import type { WorldId } from '../shared/ids';
import { dataImported, FOLDER_CHOSEN, FOLDER_GRANTED, FOLDER_STATUS, type FolderStatus } from '../shared/messages';
import { type Profile, profileStorageKey } from '../shared/profile';

const getStorage = (keys: string[] | null) => chrome.storage.local.get(keys);

/** TypeScript's DOM lib lacks the folder picker of the File System Access API */
declare function showDirectoryPicker(options: { mode: 'readwrite'; id?: string }): Promise<FileSystemDirectoryHandle>;

/** `de20 · Name`, the player id when the name is not known; a world of the old database says so */
function profileLabel({ world, player, name }: { world: WorldId; player?: number; name?: string }): string {
  if (player === undefined) return t('data.legacyProfile', { world });
  return t('data.profileLabel', { world, name: name ?? String(player) });
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** The state of the page; every change renders it anew. */
interface PageState {
  /** the profiles to export, with their keys (see `sourceKey`); null while they load */
  sources: { key: string; label: string }[] | null;
  exportChecked: Set<string>;
  exportBusy: boolean;
  exportStatus: string;
  /** the file read for the import and the choice per profile, same order */
  file: { backup: BackupFile; choices: ImportChoice[] } | null;
  /** "Zusammenführen" or "Ersetzen"; every file read starts with merging */
  importMode: ImportMode;
  /** the confirmation before replacing is shown */
  importAsking: boolean;
  importBusy: boolean;
  importStatus: string;
  /** the chosen folder and whether this page may write it; null without a folder, undefined while it loads */
  folder: { handle: FolderHandle; permission: PermissionState } | null | undefined;
  /** the state the service worker stores after each write */
  folderState: FolderStatus | undefined;
  folderBusy: boolean;
  folderStatus: string;
}

const state: PageState = {
  sources: null,
  exportChecked: new Set(),
  exportBusy: false,
  exportStatus: '',
  file: null,
  importMode: 'merge',
  importAsking: false,
  importBusy: false,
  importStatus: '',
  folder: undefined,
  folderState: undefined,
  folderBusy: false,
  folderStatus: '',
};

let root: HTMLElement;
const update = (change: Partial<PageState> = {}) => {
  Object.assign(state, change);
  render(page(), root);
};

/** reads the profiles there are to export; all are checked */
async function loadSources() {
  const sources = await openBackupSources(getStorage);
  closeBackupSources(sources);
  const list = sources.map((s) => ({ key: sourceKey(s), label: profileLabel(s) }));
  update({ sources: list, exportChecked: new Set(list.map((s) => s.key)) });
}

async function exportData(keys: ReadonlySet<string>): Promise<string> {
  const sources: BackupSource[] = await openBackupSources(getStorage);
  const now = Date.now();
  const backup = await collectBackup(selectSources(sources, keys), now).finally(() => closeBackupSources(sources));
  const name = backupFileName(now);
  download(await gzipJson(backup), name);
  const count = (table: 'battles' | 'plunders' | 'notePages' | 'players') =>
    formatNumber(backup.profiles.reduce((sum, p) => sum + p.tables[table].length, 0));
  return t('data.exported', {
    name,
    profiles: formatNumber(backup.profiles.length),
    battles: count('battles'),
    plunders: count('plunders'),
    notes: count('notePages'),
    players: count('players'),
  });
}

function startExport() {
  update({ exportBusy: true, exportStatus: t('data.exporting') });
  exportData(state.exportChecked)
    .then((done) => update({ exportStatus: done }))
    .catch((error) => {
      logError('export failed', error);
      update({ exportStatus: t('data.exportFailed') });
    })
    .finally(() => update({ exportBusy: false }));
}

async function readFile(file: File) {
  update({ file: null, importMode: 'merge', importAsking: false, importStatus: t('data.reading') });
  const read = await readBackupFile(file);
  if (!read.ok) {
    update({ importStatus: t(`data.error.${read.error}`) });
    return;
  }
  const stored = await getStorage(null);
  const choices = importChoices(read.backup, (p) => stored[profileStorageKey('settings', p)] !== undefined);
  update({ file: { backup: read.backup, choices }, importStatus: '' });
}

const importedText = (c: ImportCounts) =>
  t('data.imported', {
    profiles: formatNumber(c.profiles),
    pvp: formatNumber(c.pvp),
    notes: formatNumber(c.notes),
    buildings: formatNumber(c.greatBuildings),
    players: formatNumber(c.players),
    settings: formatNumber(c.settings),
  });

function startImport() {
  const file = state.file;
  if (!file) return;
  const items = file.choices.map((c) => ({
    profile: c.profile,
    areas: new Set((Object.keys(c.checked) as Area[]).filter((a) => c.checked[a])),
  }));
  update({ importBusy: true, importAsking: false, importStatus: t('data.importing') });
  const env = { open: openDb, get: getStorage, set: (i: Record<string, unknown>) => chrome.storage.local.set(i) };
  importBackup(items, file.backup.createdAt, env, state.importMode)
    .then((counts) => {
      update({ importStatus: importedText(counts) });
      // the open game tabs hold the old rows in memory; the service worker asks them to reload
      const profiles = items.flatMap(({ profile: { world, player }, areas }) =>
        areas.size > 0 && player !== undefined ? [{ world, player }] : [],
      );
      chrome.runtime
        .sendMessage(dataImported(profiles))
        .catch((error) => logError('announcing the import failed', error));
      return loadSources();
    })
    .catch((error) => {
      logError('import failed', error);
      update({ importStatus: t('data.importFailed') });
    })
    .finally(() => update({ importBusy: false }));
}

function exportSection(): TemplateResult {
  const { sources, exportChecked, exportBusy } = state;
  const toggle = (key: string) => (e: Event) => {
    const next = new Set(exportChecked);
    if ((e.target as HTMLInputElement).checked) next.add(key);
    else next.delete(key);
    update({ exportChecked: next });
  };
  return html`
    <h2>${t('data.export')}</h2>
    <p>${t('data.exportAbout')}</p>
    ${
      sources === null
        ? html`<p>${t('data.loadingProfiles')}</p>`
        : sources.length === 0
          ? html`<p>${t('data.noProfiles')}</p>`
          : html`<ul class="profiles">
            ${sources.map(
              (s) => html`<li>
                <label
                  ><input type="checkbox" .checked=${exportChecked.has(s.key)} @change=${toggle(s.key)} />
                  ${s.label}</label
                >
              </li>`,
            )}
          </ul>`
    }
    <button ?disabled=${exportBusy || exportChecked.size === 0} @click=${startExport}>${t('data.exportButton')}</button>
    <p class="status" role="status">${state.exportStatus}</p>
  `;
}

const AREAS: { area: Area; label: () => string }[] = [
  { area: 'pvp', label: () => t('data.area.pvp') },
  { area: 'notes', label: () => t('data.area.notes') },
  { area: 'greatBuildings', label: () => t('data.area.greatBuildings') },
  { area: 'settings', label: () => t('data.area.settings') },
];

/** a data area without rows in the file can be chosen only for replacing, it then ends up empty */
const choosable = (choice: ImportChoice, area: Area) =>
  choice.importable &&
  (choice.counts[area] > 0 || (state.importMode === 'replace' && (DATA_AREAS as readonly Area[]).includes(area)));

function choiceRow(choice: ImportChoice): TemplateResult {
  const toggle = (area: Area) => (e: Event) => {
    choice.checked[area] = (e.target as HTMLInputElement).checked;
    update({ importAsking: false });
  };
  return html`<tr>
    <th scope="row">
      ${profileLabel(choice.profile)}
      ${choice.importable ? '' : html`<div class="hint">${t('data.notImportable')}</div>`}
    </th>
    ${AREAS.map(
      ({ area, label }) => html`<td>
        <label
          ><input
            type="checkbox"
            aria-label=${label()}
            .checked=${choice.checked[area]}
            ?disabled=${!choosable(choice, area)}
            @change=${toggle(area)}
          />
          ${formatNumber(choice.counts[area])}</label
        >
      </td>`,
    )}
  </tr>`;
}

/** switching to merging unchecks the areas it cannot take, the ones without rows */
function setMode(mode: ImportMode) {
  if (mode === 'merge') {
    for (const choice of state.file?.choices ?? []) {
      for (const area of DATA_AREAS) if (choice.counts[area] === 0) choice.checked[area] = false;
    }
  }
  update({ importMode: mode, importAsking: false });
}

function modeSwitch(): TemplateResult {
  const option = (mode: ImportMode, label: string) =>
    html`<label
      ><input
        type="radio"
        name="import-mode"
        .checked=${state.importMode === mode}
        @change=${() => setMode(mode)}
      />
      ${label}</label
    >`;
  return html`<p class="mode">
      ${t('data.mode')}: ${option('merge', t('data.modeMerge'))} ${option('replace', t('data.modeReplace'))}
    </p>
    ${state.importMode === 'replace' ? html`<p class="hint">${t('data.modeReplaceHint')}</p>` : ''}`;
}

/** the profiles that exist here; while they load, every profile counts as existing */
const existsHere = (profile: Profile) => state.sources?.some((s) => s.key === sourceKey(profile)) ?? true;

const areaLabel = (area: Area) => AREAS.find((a) => a.area === area)?.label() ?? area;

/** the button, or in the mode "Ersetzen" the question naming per profile what gets emptied */
function importAction(chosen: boolean): TemplateResult {
  const { file, importBusy, importMode, importAsking } = state;
  const summary = file && importMode === 'replace' ? replaceSummary(file.choices, existsHere) : [];
  if (importAsking && summary.length) {
    return html`<div class="warn">
      <p>${t('data.replaceConfirm')}</p>
      <ul>
        ${summary.map(
          ({ profile, areas }) =>
            html`<li>
              ${t('data.replaceProfile', {
                profile: profileLabel(profile),
                areas: areas
                  .map(({ area, empty }) =>
                    empty ? t('data.replaceAreaEmpty', { area: areaLabel(area) }) : areaLabel(area),
                  )
                  .join(', '),
              })}
            </li>`,
        )}
      </ul>
      <p>
        <button ?disabled=${importBusy} @click=${startImport}>${t('data.replaceButton')}</button>
        <button @click=${() => update({ importAsking: false })}>${t('data.replaceCancel')}</button>
      </p>
    </div>`;
  }
  // nothing to empty (only profiles new here or only settings): no question needed
  const run = summary.length ? () => update({ importAsking: true }) : startImport;
  return html`<button ?disabled=${importBusy || !chosen} @click=${run}>${t('data.importButton')}</button>`;
}

function importSection(): TemplateResult {
  const { file } = state;
  const chosen = file?.choices.some((c) => Object.values(c.checked).some(Boolean)) ?? false;
  const pick = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const picked = input.files?.[0];
    if (!picked) return;
    readFile(picked).catch((error) => {
      logError('reading the backup file failed', error);
      update({ importStatus: t('data.error.notJson') });
    });
  };
  return html`
    <h2>${t('data.import')}</h2>
    <p>${t('data.importAbout')}</p>
    <p><input type="file" accept=".gz,.json,application/gzip,application/json" @change=${pick} /></p>
    ${
      file
        ? html`${modeSwitch()}<table class="choices">
            <thead>
              <tr>
                <th scope="col">${t('data.profile')}</th>
                ${AREAS.map(({ label }) => html`<th scope="col">${label()}</th>`)}
              </tr>
            </thead>
            <tbody>
              ${file.choices.map(choiceRow)}
            </tbody>
          </table>
          ${importAction(chosen)}`
        : ''
    }
    <p class="status" role="status">${state.importStatus}</p>
  `;
}

/** reads the chosen folder, its permission for this page and the state of the last write */
async function loadFolder() {
  const handle = await loadFolderHandle();
  const folder = handle ? { handle, permission: await handle.queryPermission({ mode: 'readwrite' }) } : null;
  const folderState = (await getStorage([FOLDER_STATUS]))[FOLDER_STATUS] as FolderStatus | undefined;
  update({ folder, folderState });
}

/** "Ordner wählen": the service worker merges what the folder holds and writes every profile into it */
function chooseFolder() {
  if (typeof showDirectoryPicker !== 'function') {
    update({ folderStatus: t('data.folderUnsupported') });
    return;
  }
  showDirectoryPicker({ mode: 'readwrite', id: 'forge-toolbox-backup' })
    .then(async (handle) => {
      update({ folderBusy: true, folderStatus: t('data.folderMerging') });
      await saveFolderHandle(handle);
      await loadFolder();
      const res = (await chrome.runtime.sendMessage(FOLDER_CHOSEN)) as { ok: boolean; profiles: number } | undefined;
      if (!res?.ok) throw new Error('the service worker could not use the folder');
      update({ folderStatus: t('data.folderChosen', { profiles: formatNumber(res.profiles) }) });
      return loadSources();
    })
    .catch((error) => {
      // closing the picker is no failure
      if (error instanceof DOMException && error.name === 'AbortError') return;
      logError('choosing the backup folder failed', error);
      update({ folderStatus: t('data.folderFailed') });
    })
    .finally(() => update({ folderBusy: false }));
}

/** "Ordner entfernen": forgets the folder, its files stay */
function removeFolder() {
  clearFolderHandle()
    .then(() => chrome.storage.local.remove(FOLDER_STATUS))
    .then(() => update({ folder: null, folderState: undefined, folderStatus: t('data.folderRemoved') }))
    .catch((error) => {
      logError('removing the backup folder failed', error);
      update({ folderStatus: t('data.folderFailed') });
    });
}

/** "Ordner freigeben": only a click may ask for the permission; then the service worker writes what waited */
function grantFolder() {
  const handle = state.folder?.handle;
  if (!handle) return;
  handle
    .requestPermission({ mode: 'readwrite' })
    .then(async (permission) => {
      update({ folder: { handle, permission } });
      if (permission !== 'granted') return;
      update({ folderBusy: true, folderStatus: t('data.folderMerging') });
      const res = (await chrome.runtime.sendMessage(FOLDER_GRANTED)) as { ok: boolean } | undefined;
      if (!res?.ok) throw new Error('the service worker could not use the folder');
      update({ folderStatus: t('data.folderGranted') });
    })
    .catch((error) => {
      logError('granting the backup folder failed', error);
      update({ folderStatus: t('data.folderFailed') });
    })
    .finally(() => update({ folderBusy: false }));
}

function folderSection(): TemplateResult {
  const { folder, folderState, folderBusy } = state;
  const last = folderState?.lastWrite;
  return html`
    <h2>${t('data.folder')}</h2>
    <p>${t('data.folderAbout')}</p>
    ${
      folder === undefined
        ? ''
        : folder === null
          ? html`<p>${t('data.folderNone')}</p>`
          : html`<p>
              ${t('data.folderName', { name: folder.handle.name })}<br />
              ${last === undefined ? t('data.folderNever') : t('data.folderLast', { date: formatFullDateTime(last) })}
            </p>`
    }
    ${
      folder && folder.permission !== 'granted'
        ? html`<div class="warn">
            <p>${t('data.folderPaused')}</p>
            <p><button ?disabled=${folderBusy} @click=${grantFolder}>${t('data.folderGrant')}</button></p>
            <p class="hint">${t('data.folderGrantHint')}</p>
          </div>`
        : ''
    }
    <p>
      <button ?disabled=${folderBusy} @click=${chooseFolder}>${t('data.folderChoose')}</button>
      ${folder ? html`<button ?disabled=${folderBusy} @click=${removeFolder}>${t('data.folderRemove')}</button>` : ''}
    </p>
    <p class="status" role="status">${state.folderStatus}</p>
  `;
}

const page = () => html`<h1>${t('data.pageTitle')}</h1>
  ${exportSection()} ${importSection()} ${folderSection()}`;

const app = document.getElementById('app');
if (app) {
  root = app;
  document.title = t('data.pageTitle');
  update();
  loadSources().catch((error) => {
    logError('listing the profiles failed', error);
    update({ sources: [] });
  });
  loadFolder().catch((error) => {
    logError('reading the backup folder failed', error);
    update({ folder: null });
  });
  // the service worker notes each write, and a paused backup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && FOLDER_STATUS in changes)
      update({ folderState: changes[FOLDER_STATUS]?.newValue as FolderStatus | undefined });
  });
}
