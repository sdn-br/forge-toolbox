// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../src/backup/legacy/html-markdown';

// Synthetic samples of what the editable fields of the old notes held: lines as <div> or <br>, formatting as the
// browser writes it in contenteditable.
describe('htmlToMarkdown', () => {
  it('keeps plain text as it is', () => {
    expect(htmlToMarkdown('only text, no tags')).toBe('only text, no tags');
    expect(htmlToMarkdown('')).toBe('');
  });

  it('turns lines of <div> and <br> into lines', () => {
    expect(htmlToMarkdown('first<div>second</div><div>third<br>fourth</div>')).toBe('first\nsecond\nthird\nfourth');
  });

  it('keeps an empty line between paragraphs and collapses more', () => {
    expect(htmlToMarkdown('<p>one</p><p>two</p><div><br></div><div><br></div><div><br></div><div>three</div>')).toBe(
      'one\n\ntwo\n\nthree',
    );
  });

  it('writes headings of three levels, deeper ones as the third', () => {
    expect(htmlToMarkdown('<h1>One</h1><h2>Two</h2>text<h4>Four</h4>')).toBe('# One\n\n## Two\n\ntext\n\n### Four');
  });

  it('writes bold and italic, also nested, with the spaces outside the marks', () => {
    expect(htmlToMarkdown('a <b>bold</b> <i>it</i> <strong>x <em>y</em></strong><span style="x"> z</span>')).toBe(
      'a **bold** *it* **x *y*** z',
    );
    expect(htmlToMarkdown('a<b> spaced </b>b')).toBe('a **spaced** b');
    expect(htmlToMarkdown('<b> </b><i></i>end')).toBe('end');
  });

  it('writes lists, numbered ones counted, nested ones flat', () => {
    expect(htmlToMarkdown('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>after')).toBe('- a\n- b\n- c\n\nafter');
    expect(htmlToMarkdown('<ol><li>one</li><li><b>two</b></li></ol>')).toBe('1. one\n2. **two**');
  });

  it('writes http and https links, other links as their text', () => {
    expect(htmlToMarkdown('see <a href="https://example.org/a">the page</a>')).toBe(
      'see [the page](https://example.org/a)',
    );
    expect(htmlToMarkdown('<a href="javascript:alert(1)">click</a> <a>bare</a>')).toBe('click bare');
    expect(htmlToMarkdown('<a href="https://example.org/">https://example.org/</a>')).toBe('https://example.org/');
  });

  it('keeps only the text of anything else, without scripts and styles', () => {
    expect(
      htmlToMarkdown(
        '<font color="red">red</font> and <img src="x"><script>bad()</script><style>p{}</style>&nbsp;&amp; <u>under</u>',
      ),
    ).toBe('red and & under');
  });
});
