// City map: draws a grid with its buildings from plain data. Colors, marks and tooltips come from the caller;
// the map knows nothing about building types or plundering.
import { html, svg, type TemplateResult } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { t } from '../core/texts';
import { type Bounds, gridBounds, type Tile, type TileRect } from '../domain/city-grid';
import { headerIcons } from './icons';
import {
  backToFront,
  corners,
  type MapMode,
  type MapView,
  type Projection,
  project,
  switchMode,
  tileAt,
  toScreen,
  zoomAt,
} from './map-projection';

export interface MapTile extends TileRect {
  /** the caller's key of the building, handed back on a click */
  id?: number;
  fill: string;
  /** a frame around the building, for marks and search hits */
  outline?: string;
  /** a thick frame */
  strong?: boolean;
  /** small symbols in the middle of the building, side by side; they keep the frames free for the selection */
  badges?: MapBadge[];
  /** shown on hover; lines separated by `\n` */
  tooltip: string;
}

/** a round symbol: `check` a tick, `cross` a struck circle */
export interface MapBadge {
  color: string;
  symbol: 'check' | 'cross';
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
  /** shown as this badge instead of a filled square */
  symbol?: MapBadge['symbol'];
}

export interface CityMapOptions {
  mode?: MapMode;
  /** the viewer switched the mode, to remember it */
  onMode?: (mode: MapMode) => void;
  /** the viewer clicked a building, `shift` with the shift key held; dragging the map is no click */
  onTileClick?: (tile: MapTile, how: { shift: boolean }) => void;
}

const BACKGROUND = '#1d140a';
const GROUND = '#3a2c18';
const HOVER = '#ffffff';
const ZOOM_STEP = 1.25;
/** a city opens, and the reset button returns, five zoom steps in from the whole map, centered */
export const START_VIEW: MapView = { zoom: ZOOM_STEP ** 5, panX: 0, panY: 0 };

/** the badge of the map as a legend swatch, drawn on the same 10 px as the others */
const badgeSwatch = (color: string, symbol: MapBadge['symbol']) =>
  html`<svg class="swatch badge" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4.2" fill=${BACKGROUND}
    stroke=${color} stroke-width="1.2"/>${
      symbol === 'check'
        ? svg`<path d="M3 5.1l1.4 1.5L7 3.8" fill="none" stroke=${color} stroke-width="1.3" stroke-linecap="round"
            stroke-linejoin="round"/>`
        : svg`<path d="M3.2 6.8 6.8 3.2" stroke=${color} stroke-width="1.3" stroke-linecap="round"/>`
    }</svg>`;

/** a colour square before a word; `outline` shows only its frame in the colour */
export const swatch = (color: string, outline = false) =>
  html`<span class=${outline ? 'swatch outline' : 'swatch'}
    style=${outline ? `border-color:${color}` : `background:${color}`}></span>`;

export const legendView = (items: LegendItem[]) =>
  html`<ul class="map-legend">${items.map(
    (i) => html`<li>${i.symbol ? badgeSwatch(i.color, i.symbol) : swatch(i.color, i.outline)}${i.label}</li>`,
  )}</ul>`;

/**
 * One canvas per map: several hundred buildings and streets are a few hundred path fills, and hover needs only the
 * tile under the pointer, not one DOM element per building. The instance keeps zoom, pan and mode between renders.
 */
export class CityMap {
  private canvas?: HTMLCanvasElement;
  private data: CityMapData = { areas: [], tiles: [] };
  private bounds?: Bounds;
  /** tile key → index into data.tiles */
  private index = new Map<string, number>();
  /** tile key → tooltip of the zone there */
  private zoneIndex = new Map<string, string>();
  private indexed?: CityMapData;
  private view: MapView = START_VIEW;
  private hovered = -1;
  private drag?: { x: number; y: number; view: MapView; moved: boolean };
  private observer?: ResizeObserver;
  private observedIn?: Window;
  mode: MapMode;

  constructor(private options: CityMapOptions = {}) {
    this.mode = options.mode ?? 'top';
  }

  render(data: CityMapData, legend?: TemplateResult): TemplateResult {
    if (data !== this.data) this.setData(data);
    // lit-html commits the template after this returns; draw once the canvas is in place
    queueMicrotask(() => this.draw());
    const modeButton = (mode: MapMode, label: string) =>
      html`<button class=${this.mode === mode ? 'action active' : 'action'} @click=${() => this.setMode(mode)}>${label}</button>`;
    return html`<div class="city-map">
      <div class="map-frame">
        <canvas data-tip-instant ${ref((el) => this.attach(el))}
          @pointermove=${(e: PointerEvent) => this.pointerMove(e)}
          @pointerdown=${(e: PointerEvent) => this.pointerDown(e)}
          @pointerup=${(e: PointerEvent) => this.pointerUp(e)}
          @pointercancel=${(e: PointerEvent) => this.pointerUp(e, false)}
          @pointerleave=${() => this.hover(-1)}
          @wheel=${{ handleEvent: (e: WheelEvent) => this.wheel(e), passive: false }}></canvas>
        <div class="map-tools">
          ${modeButton('top', t('cityMap.top'))}${modeButton('iso', t('cityMap.iso'))}
          <button class="action" data-tip=${t('cityMap.zoomIn')} aria-label=${t('cityMap.zoomIn')} @click=${() => this.zoomBy(ZOOM_STEP)}>${headerIcons.plus}</button>
          <button class="action" data-tip=${t('cityMap.zoomOut')} aria-label=${t('cityMap.zoomOut')} @click=${() => this.zoomBy(1 / ZOOM_STEP)}>${headerIcons.minus}</button>
          <button class="action" data-tip=${t('cityMap.zoomReset')} aria-label=${t('cityMap.zoomReset')} @click=${() => this.reset()}>${headerIcons.fit}</button>
        </div>
      </div>
      ${legend ?? ''}
    </div>`;
  }

  private setData(data: CityMapData) {
    this.data = data;
    const bounds = gridBounds([...data.areas, ...data.tiles, ...(data.zones ?? []).flatMap((z) => z.rects)]);
    // a city that grew or shrank shows in the start view again
    if (!sameBounds(bounds, this.bounds)) this.view = START_VIEW;
    this.bounds = bounds;
    this.hovered = -1;
  }

  /** the zoom and the middle of the view stay */
  private setMode(mode: MapMode) {
    if (mode === this.mode) return;
    const size = this.size();
    if (!size || !this.bounds) this.view = START_VIEW;
    else this.view = switchMode(this.mode, mode, this.bounds, size.width, size.height, this.view);
    this.mode = mode;
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
    const hovered = this.data.tiles[this.hovered];
    if (hovered) this.outline(ctx, p, hovered, HOVER, 2);
  }

  /** One building. A later version may draw the game's image of the building into its footprint here. */
  private drawTile(ctx: CanvasRenderingContext2D, p: Projection, tile: MapTile, gaps: boolean) {
    this.shape(ctx, p, tile, tile.fill);
    // every building keeps a dark border, thinner while the map is small (Nutzer, 2026-10-26)
    this.outline(ctx, p, tile, BACKGROUND, gaps ? 1 : 0.5);
    if (tile.badges) this.badges(ctx, p, tile, tile.badges);
    if (!tile.outline) return;
    // a strong frame gets a dark seam, so a light frame shows on a light fill too
    if (tile.strong) this.outline(ctx, p, tile, BACKGROUND, 5);
    this.outline(ctx, p, tile, tile.outline, tile.strong ? 3 : 1.5);
  }

  /** the badges side by side in the middle of the building, sized to it within limits */
  private badges(ctx: CanvasRenderingContext2D, p: Projection, r: TileRect, badges: MapBadge[]) {
    const mid = toScreen(p, r.x + r.width / 2, r.y + r.length / 2);
    const side = Math.min(r.width, r.length) * p.scale * (this.mode === 'iso' ? 0.7 : 1);
    const radius = Math.max(2.5, Math.min(9, side * 0.16));
    const line = Math.max(1, radius * 0.28);
    badges.forEach((b, i) => {
      const x = mid.x + (i - (badges.length - 1) / 2) * radius * 2.6;
      const y = mid.y;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = BACKGROUND;
      ctx.fill();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = line;
      ctx.stroke();
      ctx.beginPath();
      if (b.symbol === 'check') {
        ctx.moveTo(x - radius * 0.45, y);
        ctx.lineTo(x - radius * 0.13, y + radius * 0.35);
        ctx.lineTo(x + radius * 0.47, y - radius * 0.35);
      } else {
        ctx.moveTo(x - radius * 0.5, y + radius * 0.5);
        ctx.lineTo(x + radius * 0.5, y - radius * 0.5);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    });
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
      // the whole city shows at zoom 1, there is nothing to pan
      if (this.drag.moved && this.drag.view.zoom > 1) {
        this.view = { ...this.drag.view, panX: this.drag.view.panX + dx, panY: this.drag.view.panY + dy };
        this.hover(-1);
        this.draw();
        return;
      }
    }
    this.hover(this.tileIndexAt(at.x, at.y), at);
  }

  /** a press starts a drag that pans the map once it moves; one that does not move is a click */
  private pointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const at = this.local(e);
    this.drag = { ...at, view: this.view, moved: false };
    this.canvas?.setPointerCapture?.(e.pointerId);
  }

  private pointerUp(e: PointerEvent, click = true) {
    const drag = this.drag;
    this.drag = undefined;
    if (this.canvas?.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!click || !drag || drag.moved) return;
    const at = this.local(e);
    const tile = this.data.tiles[this.tileIndexAt(at.x, at.y)];
    if (tile) this.options.onTileClick?.(tile, { shift: e.shiftKey });
  }

  private hover(index: number, at?: { x: number; y: number }) {
    const tile = this.data.tiles[index];
    const text = tile ? tile.tooltip : at && this.zoneTipAt(at.x, at.y);
    // the box's tooltip reads this on the same pointer move and follows the pointer
    if (this.canvas) this.canvas.dataset.tip = text ?? '';
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

  /** the reset button: the start view */
  private reset() {
    this.view = START_VIEW;
    this.draw();
  }
}

const sameBounds = (a: Bounds | undefined, b: Bounds | undefined) =>
  a?.x1 === b?.x1 && a?.y1 === b?.y1 && a?.x2 === b?.x2 && a?.y2 === b?.y2;
