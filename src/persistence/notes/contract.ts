import type { WorldId } from '../../shared/ids';
import type { NoteGroup, NotePage } from '../../shared/model';

/** One write of the notes: rows to put and keys to delete, applied together. */
export interface NoteChanges {
  groups: NoteGroup[];
  pages: NotePage[];
  deletedGroups: [WorldId, string][];
  deletedPages: [WorldId, string][];
}

export interface NotesApi {
  'notes.load': { arg: { world: WorldId }; result: { groups: NoteGroup[]; pages: NotePage[] } };
  'notes.save': { arg: NoteChanges; result: undefined };
}
