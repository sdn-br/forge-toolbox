// Window frame for every feature: drag, pin, minimize, pop-out, close. Content comes from a lit-html render function.
import { html, render, type TemplateResult } from 'lit-html';
import { clamp } from '../../shared/math';
import { t } from '../core/texts';
import { iconButton } from './buttons';
import { headerIcons } from './icons';
import { baseCss } from './styles';
import { installTooltip } from './tooltip';
import type { UiState } from './ui-state';

export interface BoxOptions {
  id: string;
  title: () => string;
  render: () => TemplateResult;
  /** the width in pixels; for a box without the resize handle it is fixed, else the default until the viewer resizes */
  width?: number;
  /** the box has the resize handle and remembers its size; without it the box has a fixed width and the height of its content */
  resizable?: boolean;
  /** the largest height of a box without the handle, as a share of the window height (default 0.7) */
  maxHeight?: number;
  /** the size of a box with the handle until the viewer resizes it, from the window size; without it width and content height */
  defaultSize?: (window: { width: number; height: number }) => { width: number; height: number };
  /** the smallest height a box with the handle can be dragged to or shows from a saved size (default `MIN_HEIGHT`), for a
   * box whose content needs more than the default to avoid a second scrollbar */
  minHeight?: number;
  /** the content fills the body once the box has a height (resized or popped out), e.g. a map: the body does not
   * scroll, its one child takes the height */
  fill?: boolean;
  /** the feature's own CSS, after the kit's `baseCss` in the box's shadow root */
  css?: string;
  onClose?: () => void;
  /** the settings group of the feature; the header then shows a button that opens the settings at it */
  settings?: string;
}

let topZ = 2147480000;

/**
 * Calls `end` once when a drag on `el` ends: released, cancelled by the browser, the capture lost, or a move without
 * a pressed button. Aborting the returned controller removes all listeners of the drag, so none is left behind to
 * move the box later. Register it before the move listener, so a move that ends the drag moves nothing.
 */
function untilEnd(el: HTMLElement, end: (e: PointerEvent) => void): AbortController {
  const gesture = new AbortController();
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    el.addEventListener(type, end, { signal: gesture.signal });
  }
  // released in another window (Alt+Tab while dragging): the game gets no up, the next move comes without buttons
  const released = (e: PointerEvent) => {
    if (e.buttons !== 0) return;
    // the move listener comes after this one and must not move the box with this event
    e.stopImmediatePropagation();
    end(e);
  };
  el.addEventListener('pointermove', released, { signal: gesture.signal });
  return gesture;
}

/** the smallest size a box can be dragged to; a box can ask for more height with `minHeight` */
const MIN_WIDTH = 260;
const MIN_HEIGHT = 150;

export class Box {
  private host = document.createElement('div');
  private shadow = this.host.attachShadow({ mode: 'open' });
  private popup: Window | null = null;
  private renderQueued = false;

  constructor(
    private options: BoxOptions,
    private ui: UiState,
    /** opens the settings at a group; without it no box shows the settings button */
    private openSettings?: (group: string) => void,
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
    const resizableBox = this.options.resizable === true;
    const width = this.width();
    const x = state.x ?? Math.max(0, window.innerWidth - width - 90);
    const y = state.y ?? 90;
    // a saved height counts only while the box shows its body; minimized it is just the header
    const wanted = resizableBox ? (state.height ?? this.defaultSize()?.height) : undefined;
    const height =
      wanted !== undefined && !state.minimized ? clamp(wanted, this.minHeight(), window.innerHeight) : undefined;
    const classes = [
      'box',
      state.pinned && 'pinned',
      state.minimized && 'minimized',
      popped && 'popped',
      !popped && resizableBox && (state.width !== undefined || this.defaultSize() !== undefined) && 'sized',
      !popped && height !== undefined && 'tall',
      !popped && !resizableBox && 'capped',
    ]
      .filter(Boolean)
      .join(' ');
    const cap = resizableBox ? '' : `;max-height:${Math.round((this.options.maxHeight ?? 0.7) * window.innerHeight)}px`;
    const size = `width:${width}px${height === undefined ? '' : `;height:${height}px`}${cap}`;
    const style = popped ? '' : `left:${x}px;top:${y}px;${size};z-index:${this.z}`;
    const resizable = resizableBox && !popped && !state.minimized;
    const { settings } = this.options;
    const open = this.openSettings;
    const settingsButton =
      settings && open ? iconButton(t('box.settings'), () => open(settings), headerIcons.gear) : '';
    return html`<style>${baseCss}${this.options.css ?? ''}</style>
      <div class=${classes} style=${style} @pointerdown=${() => this.raise()}>
        <header @pointerdown=${(e: PointerEvent) => this.startDrag(e)}>
          <h1>${this.options.title()}</h1>
          ${
            popped
              ? ''
              : html`
            ${settingsButton}
            ${iconButton(
              t(state.pinned ? 'box.unpin' : 'box.pin'),
              () => this.set({ pinned: !state.pinned }),
              headerIcons.pin(state.pinned === true),
              state.pinned ? 'active' : '',
            )}
            ${iconButton(t('box.popout'), () => this.popOut(), headerIcons.popout)}
            ${iconButton(t('box.minimize'), () => this.set({ minimized: !state.minimized }), headerIcons.minimize)}`
          }
          ${iconButton(t('box.close'), () => this.close(), headerIcons.close)}
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

  /** the width of a box with the handle: the saved one, else the default size, else the configured one; never wider than the window. A box without the handle ignores a saved width. */
  private width(): number {
    const configured = this.options.width ?? 320;
    if (this.options.resizable !== true) return Math.min(configured, window.innerWidth);
    const wanted = this.ui.box(this.options.id).width ?? this.defaultSize()?.width ?? configured;
    return clamp(wanted, MIN_WIDTH, window.innerWidth);
  }

  private minHeight(): number {
    return this.options.minHeight ?? MIN_HEIGHT;
  }

  private defaultSize() {
    return this.options.defaultSize?.({ width: window.innerWidth, height: window.innerHeight });
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
      box.style.left = `${clamp(e.clientX - dx, 0, window.innerWidth - 60)}px`;
      box.style.top = `${clamp(e.clientY - dy, 0, window.innerHeight - 30)}px`;
    };
    const end = () => {
      gesture.abort();
      this.ui.saveBox(this.options.id, { x: box.offsetLeft, y: box.offsetTop });
    };
    const gesture = untilEnd(frame, end);
    frame.addEventListener('pointermove', move, { signal: gesture.signal });
  }

  /** Drags the bottom right corner. Independent of moving: the header moves, the handle sizes. */
  private startResize(event: PointerEvent) {
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const box = handle.parentElement as HTMLElement;
    const start = box.getBoundingClientRect();
    const size = (e: PointerEvent) => ({
      width: Math.round(clamp(start.width + e.clientX - event.clientX, MIN_WIDTH, window.innerWidth - start.left)),
      height: Math.round(
        clamp(start.height + e.clientY - event.clientY, this.minHeight(), window.innerHeight - start.top),
      ),
    });
    handle.setPointerCapture?.(event.pointerId);
    let last: ReturnType<typeof size> | undefined;
    const move = (e: PointerEvent) => {
      last = size(e);
      box.style.width = `${last.width}px`;
      box.style.height = `${last.height}px`;
      box.classList.add('sized', 'tall');
    };
    // a cancelled drag keeps the size it showed last; its event may carry no position
    const end = (e: PointerEvent) => {
      gesture.abort();
      const final = e.type === 'pointerup' ? size(e) : last;
      if (final) this.set(final);
    };
    const gesture = untilEnd(handle, end);
    handle.addEventListener('pointermove', move, { signal: gesture.signal });
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
