// The notes of the old toolbox are the HTML of an editable field. The new notes are a small Markdown subset (see
// src/content/ui/markdown.ts): headings, bold, italic, lists and links survive, everything else becomes its text.

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
/** elements that stand on lines of their own */
const LINES = new Set(['DIV', 'TABLE', 'TR', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);
const BOLD = new Set(['B', 'STRONG']);
const ITALIC = new Set(['I', 'EM']);
const LISTS = new Set(['UL', 'OL']);

/** the URL when it is http or https; any other link becomes its text */
function webUrl(href: string | null): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? href : undefined;
  } catch {
    return undefined;
  }
}

/** a mark around the text, the spaces at its ends left outside; nothing for an empty text */
function marked(text: string, mark: string): string {
  if (text.includes('\n')) return text;
  const core = text.trim();
  if (!core) return text ? ' ' : '';
  const lead = text.startsWith(core) ? '' : ' ';
  const trail = text.endsWith(core) ? '' : ' ';
  return `${lead}${mark}${core}${mark}${trail}`;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function children(node: Node): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) out += convert(child, out);
  return out;
}

/** the items of a list, nested lists flattened behind their item */
function listItems(list: Element): string[] {
  const ordered = list.tagName === 'OL';
  const lines: string[] = [];
  let n = 0;
  for (const item of Array.from(list.children)) {
    if (item.tagName !== 'LI') continue;
    let own = '';
    const nested: string[] = [];
    for (const child of Array.from(item.childNodes)) {
      if (child instanceof Element && LISTS.has(child.tagName)) nested.push(...listItems(child));
      else own += convert(child, own);
    }
    const text = oneLine(own);
    if (text) lines.push(`${ordered ? `${++n}.` : '-'} ${text}`);
    lines.push(...nested);
  }
  return lines;
}

/** the Markdown of one node; `before` is what the parent wrote so far, so a line starts only once */
function convert(node: Node, before: string): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/[\s ]+/g, ' ');
  if (!(node instanceof Element) || SKIPPED.has(node.tagName)) return '';
  const tag = node.tagName;
  if (tag === 'BR') return '\n';
  if (BOLD.has(tag)) return marked(children(node), '**');
  if (ITALIC.has(tag)) return marked(children(node), '*');
  if (/^H[1-6]$/.test(tag)) {
    const text = oneLine(children(node));
    return text ? `\n\n${'#'.repeat(Math.min(Number(tag[1]), 3))} ${text}\n\n` : '';
  }
  if (LISTS.has(tag)) return `\n\n${listItems(node).join('\n')}\n\n`;
  if (tag === 'P') return `\n\n${children(node)}\n\n`;
  if (LINES.has(tag) || tag === 'LI') return `${before && !before.endsWith('\n') ? '\n' : ''}${children(node)}\n`;
  if (tag === 'A') {
    const text = children(node);
    const url = webUrl(node.getAttribute('href'));
    const label = oneLine(text);
    return url && label && label !== url ? `[${label}](${url})` : text;
  }
  return children(node);
}

/** The Markdown of a note of the old toolbox. */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return children(body)
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
