import { html, render, type TemplateResult } from 'lit-html';
import { baseCss } from './styles';
import { installTooltip } from './tooltip';

export interface MenuItem {
  id: string;
  icon: TemplateResult;
  label: () => string;
  action: () => void;
}

const menuCss = `
/* bottom right, above the game's bottom bar: the game's own buttons fill the right edge from the top down */
:host { --menu-icon: 35px; }
.menu { position: fixed; right: 4px; bottom: 56px; z-index: 2147479999;
  display: flex; flex-direction: column; gap: 4px; padding: 4px; background: #2b1d10cc;
  border: 1px solid #8a6a3a; border-radius: 6px; }
.menu button { all: unset; cursor: pointer; width: calc(var(--menu-icon) + 10px); height: calc(var(--menu-icon) + 10px);
  display: grid; place-items: center; border-radius: 4px; color: var(--ink); background: var(--btn); }
/* cut-outs in the icons fill with --btn, so the hover colour goes through it */
.menu button:hover { --btn: var(--btn-hover); }
.menu svg { display: block; width: var(--menu-icon); height: var(--menu-icon); }
.notice { position: fixed; right: calc(var(--menu-icon) + 24px); bottom: 56px; z-index: 2147479999; max-width: 240px;
  padding: 6px 8px; background: #6a2010; color: var(--ink); border: 1px solid #8a6a3a; border-radius: 6px; }
`;

/** Vertical button bar at the right edge. Features add their entry, the menu never knows them. */
export class Menu {
  private items: MenuItem[] = [];
  private notice = '';
  private host = document.createElement('div');
  private shadow = this.host.attachShadow({ mode: 'open' });

  constructor() {
    installTooltip(this.shadow);
  }

  add(item: MenuItem): void {
    this.items.push(item);
    this.render();
  }

  /** a message next to the menu that stays until the page reloads */
  showNotice(text: string): void {
    this.notice = text;
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
          ${this.items.map((i) => html`<button data-tip=${i.label()} aria-label=${i.label()} @click=${i.action}>${i.icon}</button>`)}
        </nav>
        ${this.notice ? html`<p class="notice">${this.notice}</p>` : ''}`,
      this.shadow,
    );
  }
}
