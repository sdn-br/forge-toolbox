// City map: draws a grid with its buildings from plain data. Colors, marks and tooltips come from the caller;
// the map knows nothing about building types or plundering.
import { html, type TemplateResult } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { t } from '../core/texts';
import { type Bounds, gridBounds, type Tile, type TileRect } from '../domain/city-grid';
import {
  backToFront,
  centerOn,
  corners,
  type MapMode,
  type MapView,
  type Projection,
  project,
  tileAt,
  toScreen,
  WHOLE_MAP,
  zoomAt,
} from './map-projection';

export interface MapTile extends TileRect {
  fill: string;
  /** a frame around the building, for marks and search hits */
  outline?: string;
  /** a thick frame */
  strong?: boolean;
  /** shown on hover; lines separated by `\n` */
  tooltip: string;
}

export interface CityMapData {
  /** unlocked areas, drawn as ground */
  areas: TileRect[];
  /** drawn in this order from above; in the isometric view from back to front */
  tiles: MapTile[];
  /** single tiles to mark, e.g. free ones */
  marked?: { tiles: Tile[]; color: string };
  /** ground beside or under the city, e.g. free expansion blocks; the map widens to show them */
  zones?: MapZone[];
  /** one building to point at, framed above everything else; `focus()` brings it into view */
  focus?: { rect: TileRect; color: string };
}

export interface MapZone {
  rects: TileRect[];
  fill: string;
  outline?: string;
  /** shown on hover where no building stands */
  tooltip?: string;
}

export interface LegendItem {
  color: string;
  label: string;
  /** shown as a frame instead of a filled square */
  outline?: boolean;
}

export interface CityMapOptions {
  mode?: MapMode;
  /** the viewer switched the mode, to remember it */
  onMode?: (mode: MapMode) => void;
}

const BACKGROUND = '#1d140a';
const GROUND = '#3a2c18';
const HOVER = '#ffffff';
const ZOOM_STEP = 1.25;
/** a focused building shows at least this many pixels wide; the isometric diamond is squashed and needs more */
const FOCUS_SIZE: Record<MapMode, number> = { top: 36, iso: 112 };

export const legendView = (items: LegendItem[]) =>
  html`<ul class="map-legend">${items.map(
    (i) =>
      html`<li><span class=${i.outline ? 'swatch outline' : 'swatch'}
        style=${i.outline ? `border-color:${i.color}` : `background:${i.color}`}></span>${i.label}</li>`,
  )}</ul>`;

/**
 * One canvas per map: several hundred buildings and streets are a few hundred path fills, and hover needs only the
 * tile under the pointer, not one DOM element per building. The instance keeps zoom, pan and mode between renders.
 */
export class CityMap {
  private canvas?: HTMLCanvasElement;
  private tip?: HTMLElement;
  private data: CityMapData = { areas: [], tiles: [] };
  private bounds?: Bounds;
  /** tile key → index into data.tiles */
  private index = new Map<string, number>();
  /** tile key → tooltip of the zone there */
  private zoneIndex = new Map<string, string>();
  private indexed?: CityMapData;
  private view: MapView = WHOLE_MAP;
  private hovered = -1;
  private drag?: { x: number; y: number; view: MapView; moved: boolean };
  private observer?: ResizeObserver;
  private observedIn?: Window;
  /** asked to focus before the canvas had a size */
  private pendingFocus?: TileRect;
  /** focused since the data last changed, possibly still on the old data */
  private focusedSinceData?: TileRect;
  mode: MapMode;

  constructor(private options: CityMapOptions = {}) {
    this.mode = options.mode ?? 'top';
  }

  render(data: CityMapData, legend?: TemplateResult): TemplateResult {
    if (data !== this.data) this.setData(data);
    // lit-html commits the template after this returns; draw once the canvas is in place
    queueMicrotask(() => this.draw());
    const modeButton = (mode: MapMode, label: string) =>
      html`<button class=${this.mode === mode ? 'active' : ''} @click=${() => this.setMode(mode)}>${label}</button>`;
    return html`<div class="city-map">
      <div class="map-frame">
        <canvas ${ref((el) => this.attach(el))}
          @pointermove=${(e: PointerEvent) => this.pointerMove(e)}
          @pointerdown=${(e: PointerEvent) => this.pointerDown(e)}
          @pointerup=${(e: PointerEvent) => this.pointerUp(e)}
          @pointerleave=${() => this.hover(-1)}
          @wheel=${{ handleEvent: (e: WheelEvent) => this.wheel(e), passive: false }}></canvas>
        <div class="map-tools">
          ${modeButton('top', t('cityMap.top'))}${modeButton('iso', t('cityMap.iso'))}
          <button title=${t('cityMap.zoomIn')} @click=${() => this.zoomBy(ZOOM_STEP)}>+</button>
          <button title=${t('cityMap.zoomOut')} @click=${() => this.zoomBy(1 / ZOOM_STEP)}>−</button>
          <button title=${t('cityMap.zoomReset')} @click=${() => this.reset()}>⤢</button>
        </div>
        <div class="map-tip" hidden ${ref((el) => {
          this.tip = el as HTMLElement | undefined;
        })}></div>
      </div>
      ${legend ?? ''}
    </div>`;
  }

  private setData(data: CityMapData) {
    this.data = data;
    const bounds = gridBounds([...data.areas, ...data.tiles, ...(data.zones ?? []).flatMap((z) => z.rects)]);
    // a city that grew or shrank shows whole again; a focus asked for this data but applied to the old one comes back
    if (!sameBounds(bounds, this.bounds)) {
      this.view = WHOLE_MAP;
      this.pendingFocus ??= this.focusedSinceData;
    }
    this.focusedSinceData = undefined;
    this.bounds = bounds;
    this.hovered = -1;
  }

  /**
   * Centers `rect` and zooms in if it would be tiny. A map that has no size yet (its box just opened) does it as soon
   * as it is laid out.
   */
  focus(rect: TileRect): void {
    this.pendingFocus = rect;
    this.draw();
  }

  private applyFocus() {
    const size = this.size();
    const rect = this.pendingFocus;
    if (!rect || !size || !this.bounds) return;
    this.view = centerOn(this.mode, this.bounds, size.width, size.height, this.view, rect, FOCUS_SIZE[this.mode]);
    this.pendingFocus = undefined;
    this.focusedSinceData = rect;
  }

  private setMode(mode: MapMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.view = WHOLE_MAP;
    this.options.onMode?.(mode);
    this.refreshButtons();
    this.draw();
  }

  /** the buttons change outside a render of the owner, so they are marked here */
  private refreshButtons() {
    const buttons = this.canvas?.parentElement?.querySelectorAll('.map-tools button');
    buttons?.[0]?.classList.toggle('active', this.mode === 'top');
    buttons?.[1]?.classList.toggle('active', this.mode === 'iso');
  }

  private attach(el: Element | undefined) {
    this.canvas = el as HTMLCanvasElement | undefined;
  }

  /** The tile index for hover. Later tiles win where tiles share a tile. */
  private indexTiles() {
    if (this.indexed === this.data) return;
    this.index.clear();
    this.zoneIndex.clear();
    for (const zone of this.data.zones ?? []) {
      if (zone.tooltip === undefined) continue;
      for (const r of zone.rects) {
        for (let dx = 0; dx < r.width; dx++) {
          for (let dy = 0; dy < r.length; dy++) this.zoneIndex.set(`${r.x + dx},${r.y + dy}`, zone.tooltip);
        }
      }
    }
    this.data.tiles.forEach((tile, i) => {
      for (let dx = 0; dx < tile.width; dx++) {
        for (let dy = 0; dy < tile.length; dy++) this.index.set(`${tile.x + dx},${tile.y + dy}`, i);
      }
    });
    this.indexed = this.data;
  }

  private size(): { width: number; height: number } | undefined {
    const c = this.canvas;
    if (!c || c.clientWidth === 0 || c.clientHeight === 0) return undefined;
    return { width: c.clientWidth, height: c.clientHeight };
  }

  private projection(): Projection | undefined {
    const size = this.size();
    if (!size || !this.bounds) return undefined;
    return project(this.mode, this.bounds, size.width, size.height, this.view);
  }

  /** Watches the size with the observer of the window the map is in; after a pop-out that is another window. */
  private observe() {
    const c = this.canvas;
    const win = c?.ownerDocument.defaultView;
    if (!c || !win || win === this.observedIn) return;
    this.observer?.disconnect();
    this.observedIn = win;
    const Observer = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    this.observer = Observer ? new Observer(() => this.draw()) : undefined;
    this.observer?.observe(c);
  }

  draw(): void {
    this.observe();
    this.applyFocus();
    const c = this.canvas;
    const size = this.size();
    const p = this.projection();
    if (!c || !size) return;
    const ratio = c.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    c.width = Math.round(size.width * ratio);
    c.height = Math.round(size.height * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, size.width, size.height);
    if (!p) return;
    for (const area of this.data.areas) this.shape(ctx, p, area, GROUND);
    for (const zone of this.data.zones ?? []) {
      for (const r of zone.rects) {
        this.shape(ctx, p, r, zone.fill);
        if (zone.outline) this.outline(ctx, p, r, zone.outline, 1);
      }
    }
    const marked = this.data.marked;
    if (marked) for (const tile of marked.tiles) this.shape(ctx, p, { ...tile, width: 1, length: 1 }, marked.color);
    const gaps = p.scale >= (this.mode === 'iso' ? 8 : 5);
    for (const tile of backToFront(this.mode, this.data.tiles)) this.drawTile(ctx, p, tile, gaps);
    const focus = this.data.focus;
    if (focus) {
      this.outline(ctx, p, focus.rect, BACKGROUND, 6);
      this.outline(ctx, p, focus.rect, focus.color, 3.5);
    }
    const hovered = this.data.tiles[this.hovered];
    if (hovered) this.outline(ctx, p, hovered, HOVER, 2);
  }

  /** One building. A later version may draw the game's image of the building into its footprint here. */
  private drawTile(ctx: CanvasRenderingContext2D, p: Projection, tile: MapTile, gaps: boolean) {
    this.shape(ctx, p, tile, tile.fill);
    if (gaps) this.outline(ctx, p, tile, BACKGROUND, 1);
    if (tile.outline) this.outline(ctx, p, tile, tile.outline, tile.strong ? 3 : 1.5);
  }

  private path(ctx: CanvasRenderingContext2D, p: Projection, r: TileRect, inset = 0) {
    ctx.beginPath();
    const points = corners(r).map((c) => toScreen(p, c.x, c.y));
    // pull the corners towards the center so a frame stays inside its own building
    const cx = points.reduce((n, q) => n + q.x, 0) / 4;
    const cy = points.reduce((n, q) => n + q.y, 0) / 4;
    points.forEach((q, i) => {
      const len = Math.hypot(cx - q.x, cy - q.y) || 1;
      const x = q.x + ((cx - q.x) / len) * inset;
      const y = q.y + ((cy - q.y) / len) * inset;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  private shape(ctx: CanvasRenderingContext2D, p: Projection, r: TileRect, color: string) {
    this.path(ctx, p, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private outline(ctx: CanvasRenderingContext2D, p: Projection, r: TileRect, color: string, width: number) {
    this.path(ctx, p, r, width / 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private local(e: { clientX: number; clientY: number }) {
    const rect = this.canvas?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  /** the index of the building under a point of the canvas, -1 for none */
  tileIndexAt(x: number, y: number): number {
    const key = this.keyAt(x, y);
    return key === undefined ? -1 : (this.index.get(key) ?? -1);
  }

  private keyAt(x: number, y: number): string | undefined {
    const p = this.projection();
    if (!p) return undefined;
    this.indexTiles();
    const tile = tileAt(p, x, y);
    return `${tile.x},${tile.y}`;
  }

  /** the tooltip of the zone under a point of the canvas */
  private zoneTipAt(x: number, y: number): string | undefined {
    const key = this.keyAt(x, y);
    return key === undefined ? undefined : this.zoneIndex.get(key);
  }

  private pointerMove(e: PointerEvent) {
    const at = this.local(e);
    if (this.drag) {
      const dx = at.x - this.drag.x;
      const dy = at.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      if (this.drag.moved) {
        this.view = { ...this.drag.view, panX: this.drag.view.panX + dx, panY: this.drag.view.panY + dy };
        this.hover(-1);
        this.draw();
        return;
      }
    }
    this.hover(this.tileIndexAt(at.x, at.y), at);
  }

  private pointerDown(e: PointerEvent) {
    if (this.view.zoom <= 1) return;
    const at = this.local(e);
    this.drag = { ...at, view: this.view, moved: false };
    this.canvas?.setPointerCapture?.(e.pointerId);
  }

  private pointerUp(e: PointerEvent) {
    this.drag = undefined;
    if (this.canvas?.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  }

  private hover(index: number, at?: { x: number; y: number }) {
    const tip = this.tip;
    const tile = this.data.tiles[index];
    const text = tile ? tile.tooltip : at && this.zoneTipAt(at.x, at.y);
    if (tip) {
      tip.hidden = text === undefined;
      if (text !== undefined && at) {
        tip.textContent = text;
        const frame = this.canvas?.clientWidth ?? 0;
        // keep the tooltip inside the map: right of the pointer, left of it near the right edge
        const left = at.x + 14 + 200 > frame ? Math.max(0, at.x - 14 - 200) : at.x + 14;
        tip.style.left = `${left}px`;
        tip.style.top = `${at.y + 14}px`;
      }
    }
    if (index === this.hovered) return;
    this.hovered = index;
    this.draw();
  }

  private wheel(e: WheelEvent) {
    // the wheel zooms the map, not the box or the game behind it
    e.preventDefault();
    e.stopPropagation();
    const at = this.local(e);
    this.zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, at);
  }

  private zoomBy(factor: number, at?: { x: number; y: number }) {
    const size = this.size();
    if (!size || !this.bounds) return;
    const point = at ?? { x: size.width / 2, y: size.height / 2 };
    this.view = zoomAt(this.mode, this.bounds, size.width, size.height, this.view, factor, point.x, point.y);
    this.draw();
  }

  private reset() {
    this.view = WHOLE_MAP;
    this.draw();
  }
}

const sameBounds = (a: Bounds | undefined, b: Bounds | undefined) =>
  a?.x1 === b?.x1 && a?.y1 === b?.y1 && a?.x2 === b?.x2 && a?.y2 === b?.y2;
