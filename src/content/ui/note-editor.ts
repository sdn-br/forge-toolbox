// A note shown as rendered Markdown that turns into its source in a textarea on click, and back on leaving it.
import { html, type TemplateResult } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { t } from '../core/texts';
import { keepKeys } from './inputs';
import { renderMarkdown } from './markdown';

/** Text is saved this long after the last keystroke, and when the textarea loses focus. */
export const SAVE_DELAY = 800;

export interface NoteTarget {
  /** which note is shown; another key ends the editing of the previous one */
  key: string;
  text: string;
  placeholder: string;
  save(text: string): void;
}

/**
 * One instance per place a note shows. While the textarea is open it shows what the user types, never the stored
 * text, so a re-render after a store event keeps value, caret and focus.
 */
export class NoteEditor {
  private key?: string;
  private editing = false;
  /** the text in the textarea; taken from the store when editing starts */
  private draft?: string;
  private saved = '';
  private save?: (text: string) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private wantFocus = false;

  constructor(private update: () => void) {}

  get active(): boolean {
    return this.editing;
  }

  /** opens the textarea for this note and focuses it */
  edit(key: string): void {
    if (this.key !== key) this.stop();
    this.key = key;
    if (!this.editing) this.draft = undefined;
    this.editing = true;
    this.wantFocus = true;
    this.update();
  }

  render(target: NoteTarget): TemplateResult {
    if (target.key !== this.key) {
      this.stop();
      this.key = target.key;
    }
    if (!this.editing) {
      const empty = !target.text.trim();
      return html`<div class="note" tabindex="0" title=${t('notes.edit')}
        @click=${(e: Event) => {
          // a link opens, it does not start editing
          if (!(e.target as Element).closest('a')) this.edit(target.key);
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter') this.edit(target.key);
        }}>
        ${empty ? html`<p class="muted">${target.placeholder}</p>` : renderMarkdown(target.text)}</div>`;
    }
    if (this.draft === undefined) {
      this.draft = target.text;
      this.saved = target.text;
    }
    this.save = target.save;
    return html`<textarea class="note-input" placeholder=${target.placeholder} .value=${this.draft}
      ${ref(this.focus)}
      @input=${(e: Event) => this.input((e.target as HTMLTextAreaElement).value)}
      @keydown=${(e: KeyboardEvent) => {
        keepKeys(e);
        if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
      }}
      @keyup=${keepKeys}
      @blur=${() => {
        this.stop();
        this.update();
      }}></textarea>`;
  }

  // a stable function, so lit-html calls it only for a new textarea
  private focus = (el?: Element) => {
    if (!(el instanceof HTMLTextAreaElement) || !this.wantFocus) return;
    this.wantFocus = false;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  private input(text: string) {
    this.draft = text;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY);
  }

  private flush() {
    clearTimeout(this.timer);
    if (this.draft === undefined || this.draft === this.saved) return;
    this.saved = this.draft;
    this.save?.(this.draft);
  }

  private stop() {
    if (this.editing) this.flush();
    this.editing = false;
    this.draft = undefined;
  }
}
