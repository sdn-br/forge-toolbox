import { html } from 'lit-html';
import { t } from '../core/texts';

/** a name that opens its page in a new tab; nothing is sent until the viewer clicks */
export const externalLink = (text: string, url: string) =>
  html`<a href=${url} target="_blank" rel="noopener noreferrer">${text}</a>`;

/** a small link beside a name whose own click does something else, like filtering */
export const externalIcon = (url: string) =>
  html`<a class="ext-link" href=${url} target="_blank" rel="noopener noreferrer" data-tip=${t('foestats.open')}
    aria-label=${t('foestats.open')}>↗</a>`;
