// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { LegacyFound } from '../src/backup/legacy/types';
import { BACKUP_SETTING } from '../src/content/backup/backup-copy';
import type { CopyEntry } from '../src/content/backup/backup-store';
import { backupCopyFeature } from '../src/content/features/backup-copy';
import { settingsFeature } from '../src/content/features/settings-feature';
import v2 from './fixtures/legacy-toolbox2.json';
import { battle, copyOf, me, tables } from './helpers/backup';
import { featureContext } from './helpers/feature-context';

/** the box is not in the document, so a click changes no checkbox: set it and send the change as the browser does */
const flip = (input: HTMLInputElement | null) => {
  if (!input) throw new Error('no checkbox');
  input.checked = !input.checked;
  input.dispatchEvent(new Event('change'));
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
/** a few rounds, for the database and the gzip stream */
const settle = async () => {
  for (let i = 0; i < 20; i++) await tick();
};

const AT = new Date(2026, 9, 26, 18, 5).getTime();
const found = () =>
  copyOf(
    {
      name: 'Ich',
      settings: { a: 1 },
      tables: tables({
        battles: [battle(1), battle(2)],
        notePages: [{ world: me.world, id: 'n', group: 'g', title: 'n', text: 'x', sort: 0, updatedAt: 1 }],
      }),
    },
    AT,
  );

async function setup(options: { copy?: CopyEntry; data?: boolean; settings?: boolean; legacy?: LegacyFound } = {}) {
  const env = featureContext();
  if (options.copy) await env.copyStore.put(options.copy);
  env.legacyStore.found = options.legacy;
  if (options.data) await env.db.db.battles.put(battle(9));
  // the start reads and unpacks the copy, which takes more turns under load than a fixed count of ticks
  const start = env.ctx.foundData.start.bind(env.ctx.foundData);
  let started: Promise<unknown> = Promise.resolve();
  env.ctx.foundData.start = () => {
    const run = start();
    started = run;
    return run;
  };
  settingsFeature(env.profileCopy).setup(env.ctx);
  backupCopyFeature.setup(env.ctx);
  await started.catch(() => undefined);
  await settle();
  const dialog = () => env.boxes.get('found-data');
  /** the checkbox of an area in the row of the copy */
  const area = (label: string) =>
    dialog()?.root.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null;
  return { env, dialog, area };
}

describe('found data at the start', () => {
  it('opens a dialog with date and content, the areas preselected, and takes them by merging', async () => {
    const { env, dialog, area } = await setup({ copy: await found() });
    const box = dialog();
    expect(box?.box.isOpen).toBe(true);
    expect(box?.title).toBe('Gefundene Daten');
    expect(box?.text).toContain('Sicherungskopie auf der Spielseite vom 26.10.2026, 18:05');
    expect(['PvP', 'Notizen', 'Großbauten', 'Einstellungen'].map((l) => [area(l)?.checked, area(l)?.disabled])).toEqual(
      [
        [true, false],
        [true, false],
        [false, true],
        [true, false],
      ],
    );
    expect([...(box?.root.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim())).toEqual([
      'Übernehmen',
      'Nein',
      'Später',
    ]);
    flip(area('Notizen'));
    await tick();
    box?.click('Übernehmen');
    await settle();
    expect((await env.db.db.battles.toArray()).map((b) => b.battleId)).toEqual([1, 2]);
    expect(await env.db.db.notePages.count()).toBe(0);
    expect(await env.kv.get('settings')).toEqual({ a: 1 });
    expect(env.reloads).toBe(1);
  });

  it('greys "Übernehmen" while no area is chosen', async () => {
    const { dialog, area } = await setup({ copy: await found() });
    for (const label of ['PvP', 'Notizen', 'Einstellungen']) flip(area(label));
    await tick();
    const take = [...(dialog()?.root.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === 'Übernehmen',
    );
    expect(take?.disabled).toBe(true);
  });

  it('"Nein" closes it for good, "Später" until another day', async () => {
    const no = await setup({ copy: await found() });
    no.dialog()?.click('Nein');
    await settle();
    expect(no.dialog()?.box.isOpen).toBe(false);
    expect(await no.env.kv.get('backup.answer')).toEqual({ answer: 'no' });

    const later = await setup({ copy: await found() });
    later.dialog()?.click('Später');
    await settle();
    expect(later.dialog()?.box.isOpen).toBe(false);
    expect(await later.env.kv.get('backup.answer')).toMatchObject({ answer: 'later' });
  });

  it('stays closed without a copy or when the profile has data', async () => {
    expect((await setup()).dialog()?.box.isOpen).toBe(false);
    expect((await setup({ copy: await found(), data: true })).dialog()?.box.isOpen).toBe(false);
  });
});

const legacy: LegacyFound = {
  version: '2.x',
  dump: { attacks: v2.neighborhoodAttacks, players: v2.players, events: v2.Events, groups: v2.groups, items: v2.items },
};

describe('old toolbox data in the dialog', () => {
  /** per row of the dialog: the source and each area as count, checked, disabled */
  const rows = (root: HTMLElement | undefined) =>
    [...(root?.querySelectorAll('tbody tr') ?? [])].map((tr) => [
      tr.querySelector('th')?.textContent?.trim(),
      ...[...tr.querySelectorAll('input')].map(
        (i) => `${i.parentElement?.textContent?.trim()} ${i.checked} ${i.disabled}`,
      ),
    ]);

  it('adds a row "Alte Toolbox" behind the copy, also when the profile has data', async () => {
    const { dialog } = await setup({ copy: await found(), legacy, data: true });
    // the profile has data, so only the old data are offered
    expect(rows(dialog()?.root)).toEqual([
      ['Alte Toolbox (2.x)', '8 true false', '7 true false', '0 false true', '0 false true'],
    ]);
    expect(dialog()?.text).toContain('Eine Zeile ohne Haken gilt beim Übernehmen als Nein.');
    expect(dialog()?.text).not.toContain('Sicherungskopie wird danach überschrieben');
  });

  it('lists both sources for an empty profile and answers "Nein" for both', async () => {
    const { env, dialog } = await setup({ copy: await found(), legacy });
    expect(rows(dialog()?.root).map((r) => r[0])).toEqual([
      'Sicherungskopie auf der Spielseite vom 26.10.2026, 18:05',
      'Alte Toolbox (2.x)',
    ]);
    dialog()?.click('Nein');
    await settle();
    expect(await env.kv.get('backup.answer')).toEqual({ answer: 'no' });
    expect(await env.kv.get('legacy.answer')).toEqual({ answer: 'no' });
  });

  it('takes the old data and reloads', async () => {
    const { env, dialog } = await setup({ legacy, data: true });
    dialog()?.click('Übernehmen');
    await settle();
    expect(await env.db.db.battles.count()).toBe(4);
    expect(await env.db.db.notePages.count()).toBe(5);
    expect(env.reloads).toBe(1);
  });
});

describe('settings: data', () => {
  async function openSettings(options: { copy?: CopyEntry; data?: boolean } = {}) {
    const all = await setup(options);
    all.env.ctx.bus.emit('settings.open', { group: 'settings.core' });
    await tick();
    const box = all.env.boxes.get('settings') as NonNullable<ReturnType<typeof all.env.boxes.get>>;
    const toggle = () =>
      [...box.root.querySelectorAll('label')]
        .find((l) => l.textContent?.trim() === 'Sicherungskopie auf der Spielseite')
        ?.querySelector('input') as HTMLInputElement;
    return { ...all, box, toggle };
  }

  it('shows the backup copy once, on by default, with the hint that others can read it', async () => {
    const { box, toggle } = await openSettings();
    expect(toggle().checked).toBe(true);
    expect(box.text.split('Sicherungskopie auf der Spielseite').length).toBe(2);
    expect(box.text).toContain('andere Extensions können sie dort lesen');
  });

  it('asks before switching off, then deletes the copy; switching on asks nothing', async () => {
    const { env, box, toggle } = await openSettings({ copy: await found(), data: true });
    flip(toggle());
    await tick();
    expect(env.ctx.settings.get(BACKUP_SETTING)).toBe(true);
    expect(toggle().checked).toBe(true);
    const question = () => box.root.querySelector('p.warn');
    expect(question()?.textContent).toContain('löschen');
    box.click('Abbrechen');
    await tick();
    expect(question()).toBeNull();
    expect(env.ctx.settings.get(BACKUP_SETTING)).toBe(true);
    flip(toggle());
    await tick();
    box.click('Abschalten');
    await settle();
    expect(env.ctx.settings.get(BACKUP_SETTING)).toBe(false);
    expect(toggle().checked).toBe(false);
    expect(await env.copyStore.get(me)).toBeUndefined();
    flip(toggle());
    await tick();
    expect(question()).toBeNull();
    expect(env.ctx.settings.get(BACKUP_SETTING)).toBe(true);
  });

  it('"Gefundene Daten übernehmen" opens the dialog also when the profile has data, to take or cancel', async () => {
    const { env, box, dialog } = await openSettings({ copy: await found(), data: true });
    expect(dialog()?.box.isOpen).toBe(false);
    box.click('Gefundene Daten übernehmen');
    await settle();
    expect(dialog()?.box.isOpen).toBe(true);
    expect([...(dialog()?.root.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim())).toEqual([
      'Übernehmen',
      'Abbrechen',
    ]);
    dialog()?.click('Übernehmen');
    await settle();
    expect((await env.db.db.battles.toArray()).map((b) => b.battleId)).toEqual([1, 2, 9]);
    expect(env.reloads).toBe(1);
  });

  it('says so when nothing was found, and "Abbrechen" closes it without an answer', async () => {
    const { env, box, dialog } = await openSettings();
    // the start wrote the first copy of the empty profile; without it there is nothing to find
    await env.copyStore.delete(me);
    box.click('Gefundene Daten übernehmen');
    await settle();
    expect(dialog()?.text).toContain('Für dieses Profil wurden keine Daten gefunden.');
    dialog()?.click('Abbrechen');
    expect(dialog()?.box.isOpen).toBe(false);
    expect(await env.kv.get('backup.answer')).toBeUndefined();
  });
});
