import { html, render, type TemplateResult } from 'lit-html';
import { toolboxIcon } from './icons';
import { baseCss } from './styles';
import { installTooltip } from './tooltip';

export interface MenuItem {
  id: string;
  icon: TemplateResult;
  label: () => string;
  action: () => void;
}

export interface NoticeAction {
  label: string;
  action: () => void;
}

const menuCss = `
/* bottom right corner: the game's own buttons fill the right edge from the top down */
:host { --menu-icon: 35px; }
.menu { position: fixed; right: 4px; bottom: 4px; z-index: 2147479999;
  display: flex; flex-direction: column; padding: 4px; background: #2b1d10cc;
  border: 1px solid #8a6a3a; border-radius: 6px; }
.menu button { all: unset; cursor: pointer; width: calc(var(--menu-icon) + 10px); height: calc(var(--menu-icon) + 10px);
  display: grid; place-items: center; border-radius: 4px; color: var(--ink); background: var(--btn); }
/* cut-outs in the icons fill with --btn, so the hover colour goes through it */
.menu button:hover { --btn: var(--btn-hover); }
.menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.menu svg { display: block; width: var(--menu-icon); height: var(--menu-icon); }
/* collapsed only the handle shows; hovering the menu slides the entries out above it. Closing waits a moment, so a
   pointer that slips off the edge on the way up does not fold it away. Keyboard focus opens it too (focus-visible, so a
   clicked button keeping focus does not hold it open). Hidden entries take no clicks and no focus. */
.items { display: flex; flex-direction: column; gap: 4px; max-height: 0; overflow: hidden; opacity: 0;
  visibility: hidden; transition: max-height .2s ease .3s, opacity .2s ease .3s, padding .2s ease .3s, visibility 0s .5s; }
.menu:hover .items, .menu:has(:focus-visible) .items { max-height: 100vh; opacity: 1; visibility: visible; padding-bottom: 4px;
  transition-delay: 0s; }
@media (prefers-reduced-motion: reduce) { .items { transition: none; } }
.notice { position: fixed; right: calc(var(--menu-icon) + 24px); bottom: 4px; z-index: 2147479999; max-width: 240px;
  padding: 6px 8px; background: #6a2010; color: var(--ink); border: 1px solid #8a6a3a; border-radius: 6px; }
.notice p { margin: 0; }
/* equal columns, so both buttons take the width of the longer label */
.notice .actions { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; justify-content: end; margin-top: 6px; }
`;

/**
 * Button bar in the bottom right corner, folded to one handle until the pointer is over it. Features add their entry,
 * the menu never knows them.
 */
export class Menu {
  private items: MenuItem[] = [];
  private notice: { text: string; actions: NoticeAction[] } | null = null;
  private host = document.createElement('div');
  private shadow = this.host.attachShadow({ mode: 'open' });

  constructor() {
    installTooltip(this.shadow);
  }

  add(item: MenuItem): void {
    this.items.push(item);
    this.render();
  }

  /** a message next to the menu that stays until the page reloads or an action hides it */
  showNotice(text: string, actions: NoticeAction[] = []): void {
    this.notice = { text, actions };
    this.render();
  }

  hideNotice(): void {
    this.notice = null;
    this.render();
  }

  /** the icon size in pixels; the buttons follow */
  setIconSize(px: number): void {
    this.host.style.setProperty('--menu-icon', `${px}px`);
  }

  mount(): void {
    document.documentElement.append(this.host);
    this.render();
  }

  private render() {
    if (!this.host.isConnected) return;
    render(
      html`<style>${baseCss}${menuCss}</style>
        <nav class="menu">
          <div class="items">
            ${this.items.map((i) => html`<button data-tip=${i.label()} aria-label=${i.label()} @click=${i.action}>${i.icon}</button>`)}
          </div>
          <button class="handle" aria-label="Forge Toolbox">${toolboxIcon}</button>
        </nav>
        ${
          this.notice
            ? html`<div class="notice" role="alert">
                <p>${this.notice.text}</p>
                ${
                  this.notice.actions.length
                    ? html`<div class="actions">
                        ${this.notice.actions.map((a) => html`<button class="action" @click=${a.action}>${a.label}</button>`)}
                      </div>`
                    : ''
                }
              </div>`
            : ''
        }`,
      this.shadow,
    );
  }
}
