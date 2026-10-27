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
import { type BackupFile, backupFileName } from '../backup/format';
import { gzipJson } from '../backup/gzip';
import { type ImportChoice, type ImportCounts, importBackup, importChoices, readBackupFile } from '../backup/import';
import type { Area } from '../backup/merge';
import { logError } from '../content/core/log';
import { formatNumber, t } from '../content/core/texts';
import type { WorldId } from '../shared/ids';
import { dataImported } from '../shared/messages';
import { profileStorageKey } from '../shared/profile';

const getStorage = (keys: string[] | null) => chrome.storage.local.get(keys);

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
  importBusy: boolean;
  importStatus: string;
}

const state: PageState = {
  sources: null,
  exportChecked: new Set(),
  exportBusy: false,
  exportStatus: '',
  file: null,
  importBusy: false,
  importStatus: '',
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
  update({ file: null, importStatus: t('data.reading') });
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
  update({ importBusy: true, importStatus: t('data.importing') });
  importBackup(items, file.backup.createdAt, { open: openDb, get: getStorage, set: (i) => chrome.storage.local.set(i) })
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

function choiceRow(choice: ImportChoice): TemplateResult {
  const toggle = (area: Area) => (e: Event) => {
    choice.checked[area] = (e.target as HTMLInputElement).checked;
    update();
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
            ?disabled=${!choice.importable || choice.counts[area] === 0}
            @change=${toggle(area)}
          />
          ${formatNumber(choice.counts[area])}</label
        >
      </td>`,
    )}
  </tr>`;
}

function importSection(): TemplateResult {
  const { file, importBusy } = state;
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
        ? html`<table class="choices">
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
          <button ?disabled=${importBusy || !chosen} @click=${startImport}>${t('data.importButton')}</button>`
        : ''
    }
    <p class="status" role="status">${state.importStatus}</p>
  `;
}

const page = () => html`<h1>${t('data.pageTitle')}</h1>
  ${exportSection()} ${importSection()}`;

const app = document.getElementById('app');
if (app) {
  root = app;
  document.title = t('data.pageTitle');
  update();
  loadSources().catch((error) => {
    logError('listing the profiles failed', error);
    update({ sources: [] });
  });
}
