import type Dexie from 'dexie';
import type { Table } from 'dexie';
import type { WorldId } from '../../shared/ids';
import type { NoteGroup, NotePage } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { NotesApi } from './contract';

export type NotesTables = {
  noteGroups: Table<NoteGroup, [WorldId, string]>;
  notePages: Table<NotePage, [WorldId, string]>;
};

export function notesHandlers(db: NotesTables & Dexie): Handlers<NotesApi> {
  return {
    'notes.load': async ({ world }) => ({
      groups: await db.noteGroups.where('world').equals(world).toArray(),
      pages: await db.notePages.where('world').equals(world).toArray(),
    }),
    'notes.save': ({ groups, pages, deletedGroups, deletedPages }) =>
      db.transaction('rw', db.noteGroups, db.notePages, async () => {
        await db.noteGroups.bulkDelete(deletedGroups);
        await db.notePages.bulkDelete(deletedPages);
        await db.noteGroups.bulkPut(groups);
        await db.notePages.bulkPut(pages);
        return undefined;
      }),
  };
}
