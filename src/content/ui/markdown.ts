// A small Markdown subset for notes. It builds lit-html templates, never HTML strings: every piece of the source ends
// up as text or as an attribute value, so nothing in a note can become markup or script.
import { html, type TemplateResult } from 'lit-html';
import { externalLink } from './links';

type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { kind: 'paragraph'; lines: Inline[][] }
  | { kind: 'list'; ordered: boolean; start: number; items: Inline[][] };

/** bold, italic, link with text, bare URL; the earliest match wins */
const INLINE = /\*\*(.+?)\*\*|\*(?!\s)(.+?)(?<!\s)\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"]+)/g;
const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
/** punctuation that ends a sentence rather than a bare URL */
const URL_TAIL = /[.,;:!?)\]]+$/;

/** The URL itself when it is http or https, otherwise undefined: no javascript:, data: or relative links. */
export function safeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function parseInline(source: string, links = true): Inline[] {
  const parts: Inline[] = [];
  const text = (t: string) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last?.kind === 'text') last.text += t;
    else parts.push({ kind: 'text', text: t });
  };
  let at = 0;
  for (const m of source.matchAll(INLINE)) {
    const [whole, bold, italic, label, target, bare] = m;
    text(source.slice(at, m.index));
    at = m.index + whole.length;
    if (bold !== undefined) parts.push({ kind: 'bold', children: parseInline(bold, links) });
    else if (italic !== undefined) parts.push({ kind: 'italic', children: parseInline(italic, links) });
    else if (label !== undefined && target !== undefined) {
      const href = links ? safeUrl(target) : undefined;
      // a link that is not allowed stays as it was written
      if (href) parts.push({ kind: 'link', href, children: parseInline(label, false) });
      else text(whole);
    } else if (bare !== undefined) {
      const tail = bare.match(URL_TAIL)?.[0] ?? '';
      const url = bare.slice(0, bare.length - tail.length);
      const href = links ? safeUrl(url) : undefined;
      if (href) parts.push({ kind: 'link', href, children: [{ kind: 'text', text: url }] });
      else text(url);
      text(tail);
    }
  }
  text(source.slice(at));
  return parts;
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] | undefined;
  let list: Extract<Block, { kind: 'list' }> | undefined;
  const end = () => {
    paragraph = undefined;
    list = undefined;
  };
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = line.match(HEADING);
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);
    if (!line.trim()) end();
    else if (heading) {
      end();
      const level = (heading[1] as string).length as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, content: parseInline(heading[2] as string) });
    } else if (bullet || numbered) {
      const ordered = numbered !== null;
      const item = parseInline((ordered ? numbered?.[2] : bullet?.[1]) ?? '');
      if (list?.ordered !== ordered) {
        end();
        list = { kind: 'list', ordered, start: ordered ? Number(numbered?.[1]) : 1, items: [] };
        blocks.push(list);
      }
      list.items.push(item);
    } else {
      list = undefined;
      if (!paragraph) {
        paragraph = [];
        blocks.push({ kind: 'paragraph', lines: paragraph });
      }
      paragraph.push(parseInline(line.trim()));
    }
  }
  return blocks;
}

function inlineTemplate(parts: Inline[]): (TemplateResult | string)[] {
  return parts.map((p) => {
    if (p.kind === 'text') return p.text;
    if (p.kind === 'link') return externalLink(inlineTemplate(p.children), p.href);
    return p.kind === 'bold'
      ? html`<strong>${inlineTemplate(p.children)}</strong>`
      : html`<em>${inlineTemplate(p.children)}</em>`;
  });
}

function blockTemplate(b: Block): TemplateResult {
  if (b.kind === 'heading') {
    const content = inlineTemplate(b.content);
    if (b.level === 1) return html`<h3>${content}</h3>`;
    if (b.level === 2) return html`<h4>${content}</h4>`;
    return html`<h5>${content}</h5>`;
  }
  if (b.kind === 'list') {
    const items = b.items.map((i) => html`<li>${inlineTemplate(i)}</li>`);
    return b.ordered ? html`<ol start=${b.start}>${items}</ol>` : html`<ul>${items}</ul>`;
  }
  return html`<p>${b.lines.map((l, i) => html`${i > 0 ? html`<br />` : ''}${inlineTemplate(l)}`)}</p>`;
}

/** The note as templates; anything outside the subset shows as the text it is. */
export function renderMarkdown(source: string): TemplateResult {
  return html`${parseBlocks(source).map(blockTemplate)}`;
}

const inlineText = (parts: Inline[]): string =>
  parts.map((p) => (p.kind === 'text' ? p.text : inlineText(p.children))).join('');

/** The note without its markup, one line per heading, paragraph line and list item; for tooltips and snippets. */
export function plainText(source: string): string {
  return parseBlocks(source)
    .flatMap((b) => {
      if (b.kind === 'heading') return [inlineText(b.content)];
      if (b.kind === 'paragraph') return b.lines.map(inlineText);
      return b.items.map((item, i) => `${b.ordered ? `${b.start + i}.` : '•'} ${inlineText(item)}`);
    })
    .join('\n');
}
