import { html, render } from 'lit-html';
import { baseCss } from './styles';

export interface MenuItem {
  id: string;
  icon: string;
  label: () => string;
  action: () => void;
}

const menuCss = `
.menu { position: fixed; right: 4px; top: 50%; transform: translateY(-50%); z-index: 2147479999;
  display: flex; flex-direction: column; gap: 4px; padding: 4px; background: #2b1d10cc;
  border: 1px solid #8a6a3a; border-radius: 6px; }
.menu button { all: unset; cursor: pointer; width: 30px; height: 30px; display: grid; place-items: center;
  font-size: 18px; border-radius: 4px; background: #4a3620; }
.menu button:hover { background: #6a5030; }
.notice { position: fixed; right: 44px; top: 50%; transform: translateY(-50%); z-index: 2147479999; max-width: 240px;
  padding: 6px 8px; background: #6a2010; color: #f3e3c3; border: 1px solid #8a6a3a; border-radius: 6px; }
`;

/** Vertical button bar at the right edge. Features add their entry, the menu never knows them. */
export class Menu {
  private items: MenuItem[] = [];
  private notice = '';
  private host = document.createElement('div');
  private shadow = this.host.attachShadow({ mode: 'open' });

  add(item: MenuItem): void {
    this.items.push(item);
    this.render();
  }

  /** a message next to the menu that stays until the page reloads */
  showNotice(text: string): void {
    this.notice = text;
    this.render();
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
          ${this.items.map((i) => html`<button title=${i.label()} @click=${i.action}>${i.icon}</button>`)}
        </nav>
        ${this.notice ? html`<p class="notice">${this.notice}</p>` : ''}`,
      this.shadow,
    );
  }
}
