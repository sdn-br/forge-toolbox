// Own tooltip instead of the browser's `title`: styled like the toolbox, multi-line, and shown in the pop-out window
// too. Elements carry their text in `data-tip`; one listener per shadow root finds it, so views only set the attribute.

/** pause before a tooltip appears, as the browser's own; once one shows, the next one follows at once */
export const TIP_DELAY = 400;
const OFFSET = 14;

/**
 * Shows the `data-tip` of the element under the pointer. An element with `data-tip-instant` shows its tip without the
 * pause, for a canvas whose tip changes with the spot under the pointer (the city map sets `data-tip` on each move).
 */
export function installTooltip(root: ShadowRoot | HTMLElement): void {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  root.append(tip);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let target: Element | undefined;
  let at = { x: 0, y: 0 };

  const hide = () => {
    clearTimeout(timer);
    timer = undefined;
    target = undefined;
    tip.hidden = true;
  };

  const show = () => {
    timer = undefined;
    const text = target?.getAttribute('data-tip');
    if (!text) return hide();
    tip.textContent = text;
    tip.hidden = false;
    place();
  };

  // inside the window the pointer is in: the game's or the pop-out's
  const place = () => {
    const view = tip.ownerDocument.defaultView;
    const width = view?.innerWidth ?? Number.POSITIVE_INFINITY;
    const height = view?.innerHeight ?? Number.POSITIVE_INFINITY;
    const { width: w, height: h } = tip.getBoundingClientRect();
    const left = at.x + OFFSET + w > width ? at.x - OFFSET - w : at.x + OFFSET;
    const top = at.y + OFFSET + h > height ? at.y - OFFSET - h : at.y + OFFSET;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${Math.max(0, top)}px`;
  };

  root.addEventListener('pointermove', (event) => {
    const e = event as PointerEvent;
    at = { x: e.clientX, y: e.clientY };
    const under = (e.target as Element).closest?.('[data-tip]') ?? undefined;
    if (!under?.getAttribute('data-tip')) return hide();
    if (under === target) {
      // follows the pointer, with the text of the spot it is on now; a pending pause runs on
      if (!tip.hidden) show();
      return;
    }
    target = under;
    clearTimeout(timer);
    if (!tip.hidden || under.hasAttribute('data-tip-instant')) show();
    else timer = setTimeout(show, TIP_DELAY);
  });
  root.addEventListener('pointerout', (event) => {
    const next = (event as PointerEvent).relatedTarget as Node | null;
    if (!next || !root.contains(next)) hide();
  });
  // a click changes what the element does (pin, minimize …), so the old text would be stale
  root.addEventListener('pointerdown', hide);
  root.addEventListener('wheel', hide, { passive: true });
}
