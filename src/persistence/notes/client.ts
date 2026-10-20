import type { Call } from '../../content/core/rpc';
import type { NotePersistence } from '../../content/stores/notes';

/** Persistence through the service worker, which owns the database. */
export function notePersistence(call: Call): NotePersistence {
  return {
    load: (world) => call('notes.load', { world }),
    save: (changes) => call('notes.save', changes),
  };
}
