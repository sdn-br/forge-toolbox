// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu } from '../src/content/ui/menu';

const notice = () => document.querySelector('div')?.shadowRoot?.querySelector('.notice') ?? null;
const noticeButton = (label: string) =>
  [...(notice()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label) as HTMLElement;

describe('menu notice', () => {
  beforeEach(() => {
    for (const host of document.documentElement.querySelectorAll('div')) host.remove();
  });

  it('shows its actions as buttons and runs the clicked one', () => {
    const menu = new Menu();
    menu.mount();
    const reload = vi.fn();
    menu.showNotice('Neu laden?', [{ label: 'Neu laden', action: reload }]);

    expect(notice()?.textContent).toContain('Neu laden?');
    noticeButton('Neu laden').click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('hides the notice', () => {
    const menu = new Menu();
    menu.mount();
    menu.showNotice('Hinweis', [{ label: 'Später', action: () => menu.hideNotice() }]);

    noticeButton('Später').click();
    expect(notice()).toBeNull();
  });

  it('hides a named notice only while it is the one shown', () => {
    const menu = new Menu();
    menu.mount();
    menu.showNotice('Pausiert', [], 'folder');
    menu.showNotice('Importiert');
    menu.hideNotice('folder');
    expect(notice()?.textContent).toContain('Importiert');

    menu.showNotice('Pausiert', [], 'folder');
    menu.hideNotice('folder');
    expect(notice()).toBeNull();
  });
});
