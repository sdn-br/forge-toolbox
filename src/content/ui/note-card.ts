// The note of one player as a small card, the same in every box that shows a player.
import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../shared/ids';
import { t } from '../core/texts';
import { NoteEditor } from './note-editor';

/** what the card needs from the note store */
export interface PlayerNotes {
  playerPage(player: PlayerId): { text: string } | undefined;
  setPlayerText(player: PlayerId, text: string, name?: string): void;
}

export class PlayerNoteCard {
  private editor: NoteEditor;

  constructor(
    private notes: PlayerNotes,
    update: () => void,
  ) {
    this.editor = new NoteEditor(update);
  }

  /** `name` is kept with the note, for when the player store no longer knows the player */
  render(player: PlayerId, name?: string): TemplateResult {
    return html`<section class="card"><h2>${t('notes.card')}</h2>${this.editor.render({
      key: String(player),
      text: this.notes.playerPage(player)?.text ?? '',
      placeholder: t('notes.playerPlaceholder'),
      save: (text) => this.notes.setPlayerText(player, text, name),
    })}</section>`;
  }

  /** opens the note of this player for typing */
  edit(player: PlayerId): void {
    this.editor.edit(String(player));
  }
}
