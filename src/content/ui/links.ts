import { html, type TemplateResult } from 'lit-html';

/** a name that opens its page in a new tab; nothing is sent until the viewer clicks */
export const externalLink = (text: string | (TemplateResult | string)[], url: string) =>
  html`<a href=${url} target="_blank" rel="noopener noreferrer">${text}</a>`;

/** a small link beside a name whose own click does something else, like filtering; `label` says where it goes */
export const externalIcon = (url: string, label: string) =>
  html`<a class="ext-link" href=${url} target="_blank" rel="noopener noreferrer" data-tip=${label}
    aria-label=${label}>↗</a>`;
