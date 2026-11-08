// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { selectOnClick } from '../src/content/features/pvp/battles/view';

/** a row with a mark button whose click swaps its icon, as a toggle redraw does */
function row(select: () => void) {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td><button><svg><path></path></svg></button></td><td class="plain">x</td>';
  const button = tr.querySelector('button') as HTMLButtonElement;
  button.addEventListener('click', () => {
    button.innerHTML = '<svg><path></path></svg>';
  });
  tr.addEventListener('click', selectOnClick(7, { select }));
  document.body.append(tr);
  return tr;
}

describe('selectOnClick', () => {
  it('leaves the panel alone when a button swaps the clicked icon', () => {
    const select = vi.fn();
    const tr = row(select);
    (tr.querySelector('path') as Element).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(select).not.toHaveBeenCalled();
  });

  it('selects the battle on a click elsewhere in the row', () => {
    const select = vi.fn();
    const tr = row(select);
    (tr.querySelector('.plain') as HTMLElement).click();
    expect(select).toHaveBeenCalledWith(7);
  });
});
