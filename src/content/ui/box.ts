// Window frame for every feature: drag, pin, minimize, pop-out, close. Content comes from a lit-html render function.
import { html, render, svg, type TemplateResult } from 'lit-html';
import { t } from '../core/texts';
import { baseCss } from './styles';
import { installTooltip } from './tooltip';
import type { UiState } from './ui-state';

export interface BoxOptions {
  id: string;
  title: () => string;
  render: () => TemplateResult;
  /** default width in pixels until the viewer resizes the box */
  width?: number;
  /** the content fills the body once the box has a height (resized or popped out), e.g. a map */
  fill?: boolean;
  onClose?: () => void;
}

let topZ = 2147480000;

/** the smallest size a box can be dragged to */
export const MIN_WIDTH = 260;
export const MIN_HEIGHT = 150;

export class Box {
  private host = document.createElement('div');
  private shadow = this.host.attachShadow({ mode: 'open' });
  private popup: Window | null = null;
  private renderQueued = false;

  constructor(
    private options: BoxOptions,
    private ui: UiState,
  ) {
    this.host.dataset.forgeToolbox = options.id;
    installTooltip(this.shadow);
  }

  get isOpen(): boolean {
    return this.host.isConnected;
  }

  open(): void {
    if (!this.isOpen) document.documentElement.append(this.host);
    this.raise();
    this.update();
  }

  close(): void {
    // the window reports pagehide only after this; without the popup that handler leaves the closed box alone
    const popup = this.popup;
    this.popup = null;
    popup?.close();
    this.host.remove();
    this.options.onClose?.();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Re-render soon. Batched in a microtask: not tied to requestAnimationFrame, which Chrome throttles in background tabs. */
  update(): void {
    if (this.renderQueued || !this.isOpen) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (this.isOpen) render(this.template(), this.shadow);
    });
  }

  private template(): TemplateResult {
    const state = this.ui.box(this.options.id);
    const popped = this.popup !== null;
    const width = this.width();
    const x = state.x ?? Math.max(0, window.innerWidth - width - 90);
    const y = state.y ?? 90;
    // a saved height counts only while the box shows its body; minimized it is just the header
    const height =
      state.height !== undefined && !state.minimized ? clamp(state.height, MIN_HEIGHT, window.innerHeight) : undefined;
    const classes = [
      'box',
      state.pinned && 'pinned',
      state.minimized && 'minimized',
      popped && 'popped',
      !popped && state.width !== undefined && 'sized',
      !popped && height !== undefined && 'tall',
    ]
      .filter(Boolean)
      .join(' ');
    const size = `width:${width}px${height === undefined ? '' : `;height:${height}px`}`;
    const style = popped ? '' : `left:${x}px;top:${y}px;${size};z-index:${this.z}`;
    const resizable = !popped && !state.minimized;
    return html`<style>${baseCss}</style>
      <div class=${classes} style=${style} @pointerdown=${() => this.raise()}>
        <header @pointerdown=${(e: PointerEvent) => this.startDrag(e)}>
          <h1>${this.options.title()}</h1>
          ${
            popped
              ? ''
              : html`
            ${headerButton(
              t(state.pinned ? 'box.unpin' : 'box.pin'),
              () => this.set({ pinned: !state.pinned }),
              pinIcon(state.pinned === true),
              state.pinned ? 'pin active' : 'pin',
            )}
            ${headerButton(t('box.popout'), () => this.popOut(), '⧉')}
            ${headerButton(t('box.minimize'), () => this.set({ minimized: !state.minimized }), '▁')}`
          }
          ${headerButton(t('box.close'), () => this.close(), '✕')}
        </header>
        <div class=${this.options.fill ? 'body fill' : 'body'}>${this.options.render()}</div>
        ${
          resizable
            ? html`<div class="resize-handle" data-tip=${t('box.resize')}
              @pointerdown=${(e: PointerEvent) => this.startResize(e)}
              @dblclick=${() => this.set({ width: undefined, height: undefined })}></div>`
            : ''
        }
      </div>`;
  }

  /** the saved width, else the configured one; never wider than the window */
  private width(): number {
    const saved = this.ui.box(this.options.id).width;
    if (saved === undefined) return this.options.width ?? 320;
    return clamp(saved, MIN_WIDTH, window.innerWidth);
  }

  private z = ++topZ;

  private raise() {
    if (this.z !== topZ) {
      this.z = ++topZ;
      this.update();
    }
  }

  private set(patch: Parameters<UiState['saveBox']>[1]) {
    this.ui.saveBox(this.options.id, patch);
    this.update();
  }

  private startDrag(event: PointerEvent) {
    const state = this.ui.box(this.options.id);
    if (state.pinned || this.popup || (event.target as Element).closest('button')) return;
    const frame = event.currentTarget as HTMLElement;
    const box = frame.parentElement as HTMLElement;
    const dx = event.clientX - box.offsetLeft;
    const dy = event.clientY - box.offsetTop;
    frame.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      box.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, e.clientX - dx))}px`;
      box.style.top = `${Math.max(0, Math.min(window.innerHeight - 30, e.clientY - dy))}px`;
    };
    const up = () => {
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerup', up);
      this.ui.saveBox(this.options.id, { x: box.offsetLeft, y: box.offsetTop });
    };
    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerup', up);
  }

  /** Drags the bottom right corner. Independent of moving: the header moves, the handle sizes. */
  private startResize(event: PointerEvent) {
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const box = handle.parentElement as HTMLElement;
    const start = box.getBoundingClientRect();
    const size = (e: PointerEvent) => ({
      width: Math.round(clamp(start.width + e.clientX - event.clientX, MIN_WIDTH, window.innerWidth - start.left)),
      height: Math.round(clamp(start.height + e.clientY - event.clientY, MIN_HEIGHT, window.innerHeight - start.top)),
    });
    handle.setPointerCapture?.(event.pointerId);
    const move = (e: PointerEvent) => {
      const { width, height } = size(e);
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      box.classList.add('sized', 'tall');
    };
    const up = (e: PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      this.set(size(e));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }

  private async popOut() {
    const width = this.width() + 20;
    const height = Math.min(Math.max(this.host.shadowRoot?.querySelector('.box')?.scrollHeight ?? 300, 220), 800);
    const pip = (window as { documentPictureInPicture?: { requestWindow(o: object): Promise<Window> } })
      .documentPictureInPicture;
    let win: Window | null = null;
    try {
      win = pip ? await pip.requestWindow({ width, height }) : null;
    } catch {
      win = null;
    }
    win ??= window.open('', `forge-toolbox-${this.options.id}`, `width=${width},height=${height}`);
    if (!win) return;
    this.popup = win;
    win.document.title = this.options.title();
    win.document.body.style.margin = '0';
    win.document.body.append(this.host);
    win.addEventListener('pagehide', () => {
      if (this.popup !== win) return;
      this.popup = null;
      if (this.host.isConnected && this.host.ownerDocument !== document) {
        document.documentElement.append(this.host);
        this.update();
      }
    });
    this.update();
  }
}

/** icon-only, so the label is also its accessible name */
const headerButton = (label: string, action: () => void, icon: string | TemplateResult, cls = '') =>
  html`<button class=${cls} data-tip=${label} aria-label=${label} @click=${action}>${icon}</button>`;

/** loose: an outlined pin, tilted; pinned: a filled pin standing upright (gold through the button's colour) */
const pinIcon = (pinned: boolean) =>
  html`<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">${svg`<g
    transform=${pinned ? '' : 'rotate(40 8 8)'} fill=${pinned ? 'currentColor' : 'none'} stroke="currentColor"
    stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">
    <path d="M5 1.5h6M6 1.5v5L3.5 9.5h9L10 6.5v-5" /><path d="M8 9.5V15" /></g>`}</svg>`;

/** `value` within `min` and `max`; a max below the min gives the min */
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
