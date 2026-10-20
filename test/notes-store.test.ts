import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { NoteStore, PLAYER_GROUP, playerPageId } from '../src/content/stores/notes';
import { playerId, worldId } from '../src/shared/ids';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');

function setup(db = testDb()) {
  const bus = createBus();
  let now = 1000;
  let id = 0;
  const store = new NoteStore(
    bus,
    world,
    db.notes,
    () => now,
    () => `id${++id}`,
  );
  const events: unknown[] = [];
  bus.on('note.changed', (e) => events.push(e));
  return { db, store, events, setNow: (at: number) => (now = at) };
}

/** a second store on the same database, as after a reload of the game */
async function reloaded(db: ReturnType<typeof testDb>) {
  const { store } = setup(db);
  await store.load();
  return store;
}

describe('NoteStore', () => {
  it('adds groups at the end and pages at the top of their group', () => {
    const { store } = setup();
    const a = store.addGroup('A');
    const b = store.addGroup('B');
    const first = store.addPage(a.id, 'first');
    const second = store.addPage(a.id, 'second');
    store.addPage(b.id, 'other');
    expect(store.groups().map((g) => g.name)).toEqual(['A', 'B']);
    expect(store.pages(a.id).map((p) => p.title)).toEqual(['second', 'first']);
    expect(first?.text).toBe('');
    expect(second?.updatedAt).toBe(1000);
  });

  it('takes no normal page into the player group or a missing group', () => {
    const { store } = setup();
    expect(store.addPage(PLAYER_GROUP, 'x')).toBeUndefined();
    expect(store.addPage('missing', 'x')).toBeUndefined();
    expect(store.allPages()).toEqual([]);
  });

  it('saves groups and pages and loads them again per world', async () => {
    const { db, store } = setup();
    const group = store.addGroup('Gilde');
    const page = store.addPage(group.id, 'Regeln');
    store.setText(page?.id ?? '', '**Wichtig**');
    await vi.waitFor(async () => expect((await reloaded(db)).page(page?.id ?? '')?.text).toBe('**Wichtig**'));
    const other = new NoteStore(createBus(), worldId('en1'), db.notes);
    await other.load();
    expect(other.groups()).toEqual([]);
  });

  it('renames, changes text and stamps the time, but not for unchanged values', () => {
    const { store, events, setNow } = setup();
    const group = store.addGroup('A');
    const page = store.addPage(group.id, 'old');
    const id = page?.id ?? '';
    events.length = 0;
    setNow(2000);
    store.renamePage(id, 'new');
    store.renamePage(id, 'new');
    store.setText(id, 'text');
    store.setText(id, 'text');
    store.renameGroup(group.id, 'B');
    store.renameGroup(group.id, 'B');
    expect(store.page(id)).toMatchObject({ title: 'new', text: 'text', updatedAt: 2000 });
    expect(store.group(group.id)?.name).toBe('B');
    expect(events).toEqual([{}, {}, {}]);
  });

  it('deletes a group with its pages, also in the database', async () => {
    const { db, store } = setup();
    const a = store.addGroup('A');
    const b = store.addGroup('B');
    store.addPage(a.id, 'one');
    store.addPage(a.id, 'two');
    const kept = store.addPage(b.id, 'kept');
    store.deleteGroup(a.id);
    expect(store.groups().map((g) => g.name)).toEqual(['B']);
    expect(store.allPages().map((p) => p.title)).toEqual(['kept']);
    await vi.waitFor(async () => {
      const again = await reloaded(db);
      expect(again.groups().map((g) => g.name)).toEqual(['B']);
      expect(again.allPages().map((p) => p.id)).toEqual([kept?.id]);
    });
  });

  it('moves groups and pages and keeps the new order', async () => {
    const { db, store } = setup();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => store.addGroup(n));
    store.moveGroup(a?.id ?? '', 2);
    expect(store.groups().map((g) => g.name)).toEqual(['B', 'C', 'A']);
    store.moveGroup(a?.id ?? '', 0);
    expect(store.groups().map((g) => g.name)).toEqual(['A', 'B', 'C']);
    for (const title of ['3', '2', '1']) store.addPage(b?.id ?? '', title);
    const one = store.pages(b?.id ?? '')[0];
    store.movePage(one?.id ?? '', 1);
    expect(store.pages(b?.id ?? '').map((p) => p.title)).toEqual(['2', '1', '3']);
    await vi.waitFor(async () => {
      const again = await reloaded(db);
      expect(again.groups().map((g) => g.name)).toEqual(['A', 'B', 'C']);
      expect(again.pages(b?.id ?? '').map((p) => p.title)).toEqual(['2', '1', '3']);
    });
    expect(c).toBeDefined();
  });

  it('creates a player page with the first text and deletes it when the text is emptied', async () => {
    const { db, store, events } = setup();
    const player = playerId(42);
    store.setPlayerText(player, '  ', 'Anna');
    expect(store.playerPage(player)).toBeUndefined();
    expect(events).toEqual([]);

    store.setPlayerText(player, 'hat Schilde', 'Anna');
    expect(store.playerPage(player)).toMatchObject({
      id: playerPageId(player),
      group: PLAYER_GROUP,
      title: 'Anna',
      text: 'hat Schilde',
      player,
    });
    expect(store.pages(PLAYER_GROUP)).toHaveLength(1);
    await vi.waitFor(async () => expect((await reloaded(db)).playerPage(player)?.text).toBe('hat Schilde'));

    store.setPlayerText(player, '\n');
    expect(store.playerPage(player)).toBeUndefined();
    expect(events).toEqual([{ player }, { player }]);
    await vi.waitFor(async () => expect((await reloaded(db)).playerPage(player)).toBeUndefined());
  });

  it('keeps the last known name of a player page up to date and never renames it otherwise', () => {
    const { store } = setup();
    const player = playerId(42);
    store.setPlayerText(player, 'x', 'Anna');
    store.setPlayerText(player, 'x', 'Anna B.');
    store.renamePage(playerPageId(player), 'other');
    expect(store.playerPage(player)?.title).toBe('Anna B.');
  });

  it('writes a page created and deleted in one go not at all', async () => {
    const { db, store } = setup();
    const save = vi.spyOn(db.notes, 'save');
    const group = store.addGroup('A');
    const page = store.addPage(group.id, 'gone');
    store.deletePage(page?.id ?? '');
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0].pages).toEqual([]);
  });
});
