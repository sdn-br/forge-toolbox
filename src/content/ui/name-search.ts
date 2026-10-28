// A search field that suggests names while typing, each with how often it occurs. The field is only for finding:
// typing narrows the list, and what the owner acts on is the pick (click, or Enter on the highlighted suggestion),
// after which the field is empty again.
import { html, type TemplateResult } from 'lit-html';
import { clamp } from '../../shared/math';
import { compareText } from '../core/texts';
import { keepKeys } from './inputs';

export interface Suggestion {
  name: string;
  count: number;
}

/** the longest list of suggestions; a longer one would only scroll */
const MAX_SUGGESTIONS = 30;

/**
 * The names that contain the query, ignoring case, each once with how often it occurs. Names that start with the query
 * come first, then the others, each part alphabetical. An empty query suggests nothing.
 */
export function suggestNames(names: Iterable<string>, query: string, limit = MAX_SUGGESTIONS): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const counts = new Map<string, number>();
  for (const name of names) if (name.toLowerCase().includes(q)) counts.set(name, (counts.get(name) ?? 0) + 1);
  // names that start with the query rank 0, the others 1
  return [...counts]
    .map(([name, count]) => ({ name, count, rank: name.toLowerCase().startsWith(q) ? 0 : 1 }))
    .sort((a, b) => a.rank - b.rank || compareText(a.name, b.name))
    .slice(0, limit)
    .map(({ name, count }) => ({ name, count }));
}

export interface NameSearchOptions {
  placeholder: () => string;
  /** the names to suggest from, one entry per occurrence; asked on every render and key */
  names: () => Iterable<string>;
  /** the owner renders again; the field keeps its state between renders */
  update: () => void;
  /** a suggestion was picked; the field is empty again */
  onPick: (name: string) => void;
  /** the list takes room below the field instead of lying over what follows, for a box that grows with its content */
  inline?: boolean;
}

let instances = 0;

/**
 * The field with its suggestion list as one piece of state for a box. Keys typed into it stay away from the game.
 * Arrow keys move the highlight, Enter picks it, Escape closes the list, a click picks a suggestion.
 */
export class NameSearch {
  text = '';
  private open = false;
  private active = 0;
  /** the suggestions of the last render, the ones the keys move through and pick from */
  private shown: Suggestion[] = [];
  private id = `name-search-${++instances}`;

  constructor(private options: NameSearchOptions) {}

  render(): TemplateResult {
    const list = this.open ? suggestNames(this.options.names(), this.text) : [];
    this.shown = list;
    const active = Math.min(this.active, list.length - 1);
    const expanded = list.length > 0;
    const option = (s: Suggestion, i: number) =>
      html`<li id=${`${this.id}-${i}`} role="option" class=${i === active ? 'active' : ''}
        aria-selected=${i === active ? 'true' : 'false'}
        @mousedown=${(e: MouseEvent) => e.preventDefault()} @click=${() => this.pick(s.name)}>
        <span>${s.name}</span><span class="num">${s.count}</span></li>`;
    // one template whatever the state: swapping templates would replace the field and take its focus mid-typing
    return html`<div class=${this.options.inline ? 'name-search inline' : 'name-search'}>
      <input type="search" role="combobox" aria-autocomplete="list" aria-controls=${this.id}
        aria-expanded=${expanded ? 'true' : 'false'} aria-activedescendant=${expanded ? `${this.id}-${active}` : ''}
        placeholder=${this.options.placeholder()} .value=${this.text}
        @input=${(e: Event) => this.input((e.target as HTMLInputElement).value)}
        @keydown=${(e: KeyboardEvent) => this.key(e)} @keypress=${keepKeys} @keyup=${keepKeys}
        @blur=${() => this.close()} />
      <ul id=${this.id} role="listbox" class="suggestions" ?hidden=${!expanded}>${list.map(option)}</ul>
    </div>`;
  }

  private input(text: string) {
    this.text = text;
    this.open = text.trim() !== '';
    this.active = 0;
    this.options.update();
  }

  private key(e: KeyboardEvent) {
    keepKeys(e);
    const list = this.shown;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!this.open) {
          this.open = true;
          this.active = 0;
        } else this.active = clamp(this.active + 1, 0, list.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.active = Math.max(this.active - 1, 0);
        break;
      case 'Enter': {
        const picked = list[Math.min(this.active, list.length - 1)];
        if (!picked) return;
        e.preventDefault();
        this.pick(picked.name);
        return;
      }
      case 'Escape':
        // on a closed list Escape is left to the field, which empties itself and reports that as input
        if (list.length === 0) return;
        e.preventDefault();
        this.open = false;
        break;
      default:
        return;
    }
    this.options.update();
  }

  private pick(name: string) {
    this.text = '';
    this.open = false;
    this.active = 0;
    this.options.onPick(name);
    this.options.update();
  }

  private close() {
    if (!this.open) return;
    this.open = false;
    this.options.update();
  }
}
