// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { plainText, renderMarkdown, safeUrl } from '../src/content/ui/markdown';

function draw(source: string): HTMLElement {
  const container = document.createElement('div');
  render(renderMarkdown(source), container);
  return container;
}

/** the drawn markup without lit-html's comment markers */
const markup = (source: string) => draw(source).innerHTML.replace(/<!--[^>]*-->/g, '');

describe('renderMarkdown', () => {
  it('parses a note once while its text stays', () => {
    const first = renderMarkdown('# Titel\n\n**fett**');
    expect(renderMarkdown('# Titel\n\n**fett**')).toBe(first);
    expect(renderMarkdown('# Anders')).not.toBe(first);
  });

  it('draws headings of three levels', () => {
    expect(markup('# One\n## Two\n### Three\n#### Four')).toBe(
      '<h3>One</h3><h4>Two</h4><h5>Three</h5><p>#### Four</p>',
    );
  });

  it('draws bold and italic, also nested', () => {
    expect(markup('a **b** *c* **d *e* f**')).toBe(
      '<p>a <strong>b</strong> <em>c</em> <strong>d <em>e</em> f</strong></p>',
    );
  });

  it('keeps stars that mark nothing', () => {
    expect(markup('2 * 3 * 4 and **open')).toBe('<p>2 * 3 * 4 and **open</p>');
  });

  it('draws bullet and numbered lists and keeps the first number', () => {
    expect(markup('- a\n* b\n+ c\n\n3. x\n4) y')).toBe(
      '<ul><li>a</li><li>b</li><li>c</li></ul><ol start="3"><li>x</li><li>y</li></ol>',
    );
  });

  it('starts a new list when the kind changes', () => {
    expect(markup('- a\n1. b')).toBe('<ul><li>a</li></ul><ol start="1"><li>b</li></ol>');
  });

  it('splits paragraphs at blank lines and keeps single line breaks', () => {
    expect(markup('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>');
  });

  it('draws http and https links that open in a new tab', () => {
    const link = draw('see [the wiki](https://example.org/a?b=1) now').querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.org/a?b=1');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toBe('the wiki');
  });

  it('turns bare URLs into links and leaves trailing punctuation outside', () => {
    const container = draw('look at http://example.org/x. Or (https://example.org/y)!');
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['http://example.org/x', 'https://example.org/y']);
    expect(container.textContent).toBe('look at http://example.org/x. Or (https://example.org/y)!');
  });

  it('does not nest a bare URL in a link text', () => {
    const container = draw('[https://a.example](https://b.example)');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://b.example/');
  });

  describe('treats markup and script as text', () => {
    it.each([
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href="javascript:alert(1)">x</a>',
      '<b onclick="alert(1)">bold</b>',
      '<iframe src="https://evil.example"></iframe>',
      '<svg onload=alert(1)>',
    ])('%s', (source) => {
      const container = draw(source);
      expect(container.textContent).toBe(source);
      expect(container.querySelectorAll('script, img, iframe, svg, b')).toHaveLength(0);
      // a URL inside the markup may still become a plain web link
      for (const a of container.querySelectorAll('a')) expect(a.getAttribute('href')).toMatch(/^https?:\/\//);
      expect(container.querySelectorAll('[onerror], [onclick], [onload]')).toHaveLength(0);
    });

    it('in headings, list items and link texts', () => {
      const container = draw('# <script>x</script>\n- <img src=x>\n[<b>t</b>](https://ok.example)');
      expect(container.querySelectorAll('script, img, b')).toHaveLength(0);
      expect(container.querySelector('a')?.textContent).toBe('<b>t</b>');
    });
  });

  it.each([
    ['javascript:', '[x](javascript:alert(1))'],
    ['javascript: in mixed case', '[x](JaVaScRiPt:alert(1))'],
    ['data:', '[x](data:text/html,<script>alert(1)</script>)'],
    ['vbscript:', '[x](vbscript:msgbox)'],
    ['relative', '[x](/settings)'],
    ['protocol-relative', '[x](//evil.example)'],
  ])('keeps a %s link as plain text', (_name, source) => {
    const container = draw(source);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe(source);
  });

  it('cannot break out of the href attribute', () => {
    const link = draw('[x](https://a.example/"onmouseover="alert(1))').querySelector('a');
    expect(link?.getAttribute('onmouseover')).toBeNull();
    expect([...(link?.attributes ?? [])].map((a) => a.name).sort()).toEqual(['href', 'rel', 'target']);
  });
});

describe('safeUrl', () => {
  it('allows http and https only', () => {
    expect(safeUrl('https://example.org')).toBe('https://example.org/');
    expect(safeUrl('http://example.org/a')).toBe('http://example.org/a');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('ftp://example.org')).toBeUndefined();
    expect(safeUrl('not a url')).toBeUndefined();
  });
});

describe('plainText', () => {
  it('drops the markup and keeps one line per block line', () => {
    expect(plainText('# Title\n**bold** and *it*\nnext\n\n- a\n- [b](https://x.example)\n\n2. c\n3. d')).toBe(
      'Title\nbold and it\nnext\n• a\n• b\n2. c\n3. d',
    );
  });

  it('keeps forbidden links and markup as written', () => {
    expect(plainText('[x](javascript:y) <b>z</b>')).toBe('[x](javascript:y) <b>z</b>');
  });

  it('is empty for blank text', () => {
    expect(plainText('  \n\n ')).toBe('');
  });
});
