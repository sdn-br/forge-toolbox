import type { WorldId } from '../../shared/ids';
import type { NoteChanges, NoteGroup, NotePage } from '../../shared/model';

export interface NotesApi {
  'notes.load': { arg: { world: WorldId }; result: { groups: NoteGroup[]; pages: NotePage[] } };
  'notes.save': { arg: NoteChanges; result: undefined };
}
