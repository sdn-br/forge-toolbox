// The game's script `ForgeHX-<hash>.js` holds the index of its assets on the Inno CDN (see shared/cdn-assets.ts).

const SELECTOR = 'script[src*="ForgeHX"]';

/** a page without the script after this long is no game page the index can come from */
export const SCRIPT_WAIT = 120_000;

const absolute = (el: Element, doc: Document): string | undefined => {
  const src = el.getAttribute('src');
  if (!src) return undefined;
  try {
    return new URL(src, doc.baseURI).href;
  } catch {
    return undefined;
  }
};

/**
 * The absolute URL of the game's script, as soon as the page has its tag. The content script starts before the page is
 * parsed, so it watches the document until the tag appears; after `wait` ms without one it gives up with undefined.
 */
export function findForgeScript(doc: Document = document, wait = SCRIPT_WAIT): Promise<string | undefined> {
  const now = doc.querySelector(SELECTOR);
  if (now) return Promise.resolve(absolute(now, doc));
  return new Promise((resolve) => {
    const done = (url: string | undefined) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(url);
    };
    const observer = new MutationObserver(() => {
      const el = doc.querySelector(SELECTOR);
      if (el) done(absolute(el, doc));
    });
    observer.observe(doc, { childList: true, subtree: true });
    const timer = setTimeout(() => done(undefined), wait);
  });
}
