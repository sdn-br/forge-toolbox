// The extension's own page "Daten verwalten": export (later import) of the stored data as a file, every world, also
// without the game open. It lives in the extension origin and opens the database itself, like the service worker.
import { openDb } from '../background/db';
import { collectBackup } from '../backup/collect';
import { backupFileName } from '../backup/format';
import { gzipJson } from '../backup/gzip';
import { logError } from '../content/core/log';
import { formatNumber, t } from '../content/core/texts';

const db = openDb();

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function exportData(): Promise<string> {
  const settings = (await chrome.storage.local.get('settings')).settings as Record<string, unknown> | undefined;
  const now = Date.now();
  const backup = await collectBackup(db, settings, now);
  const name = backupFileName(now);
  download(await gzipJson(backup), name);
  const { battles, plunders, notePages, players } = backup.tables;
  return t('data.exported', {
    name,
    battles: formatNumber(battles.length),
    plunders: formatNumber(plunders.length),
    notes: formatNumber(notePages.length),
    players: formatNumber(players.length),
  });
}

function render(root: HTMLElement) {
  document.title = t('data.pageTitle');
  const h1 = document.createElement('h1');
  h1.textContent = t('data.pageTitle');
  const h2 = document.createElement('h2');
  h2.textContent = t('data.export');
  const about = document.createElement('p');
  about.textContent = t('data.exportAbout');
  const button = document.createElement('button');
  button.textContent = t('data.exportButton');
  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');
  button.addEventListener('click', () => {
    button.disabled = true;
    status.textContent = t('data.exporting');
    exportData()
      .then((done) => {
        status.textContent = done;
      })
      .catch((error) => {
        logError('export failed', error);
        status.textContent = t('data.exportFailed');
      })
      .finally(() => {
        button.disabled = false;
      });
  });
  root.append(h1, h2, about, button, status);
}

const root = document.getElementById('app');
if (root) render(root);
