import { html, type TemplateResult } from 'lit-html';
import { headerIcons } from './icons';

/** The one clickable line of a foldable part of the box: a chevron and the text; the whole line folds it. `cls` marks
 * which part it belongs to, the look comes from `snipe-toggle`. */
export const foldToggle = (
  cls: string,
  expanded: boolean,
  text: TemplateResult | string,
  label: string,
  toggle: () => void,
) =>
  html`<button class=${`snipe-toggle ${cls}`} aria-expanded=${expanded ? 'true' : 'false'}
    aria-label=${label} @click=${() => toggle()}>${
      expanded ? headerIcons.chevronDown : headerIcons.chevronRight
    }<span>${text}</span></button>`;
