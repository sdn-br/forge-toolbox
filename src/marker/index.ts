// Runs in the page (MAIN world). Draws golden arrows over the game canvas above given city buildings and moves them
// with the game camera every frame. The content script says which buildings to mark, or to hide them; the page tells
// it which arrows went away (dismissed by the viewer, another city view, or no engine).
//
// debt: the engine capture and the scene lookup rely on undocumented internals of the game engine (Lime/OpenFL app
// found through V8 call sites of requestAnimationFrame, stage children, `gameContainer`, `_isoScene.isoToScreen`,
// `_camera`, `_zoomFactor`). Ceiling: a game update can rename or restructure them and the arrows silently stop.
// Upgrade: when that happens, fix the scene lookup against the new engine, or fall back to marking in the city map
// box, which needs no engine access.
import { logError, logInfo } from '../content/core/log';
import {
  MARKER_TAG,
  type MarkerCommand,
  type MarkerEvent,
  type MarkerSpot,
  parseMarkerCommand,
} from '../shared/marker-protocol';
import {
  ARROW,
  anchorOf,
  arrowOffset,
  arrowScale,
  type CanvasBox,
  cssPerStage,
  nearCanvas,
  type Point,
  stageToViewport,
} from './geometry';

/** the parts of the game engine this module reads; everything is optional, since nothing about it is guaranteed */
interface EngineNode {
  __children?: EngineNode[];
  /** false while the game shows another view over the city (research, continent map, expedition, battlegrounds) */
  __visible?: unknown;
  gameContainer?: EngineNode;
  /** holds the game's windows (market, inventory, army); empty but for a hidden backdrop while none is open */
  windowContainer?: EngineNode;
  _isoScene?: IsoScene;
}
interface IsoScene {
  isoToScreen(x: number, y: number): Point;
  _camera?: unknown;
  _zoomFactor?: unknown;
}
interface LimeApp {
  stage: EngineNode & { stageWidth?: unknown };
  renderer: unknown;
  window: unknown;
}
interface CallSite {
  getThis(): unknown;
}

/** frames to watch for the game loop before giving up */
const CAPTURE_FRAMES = 600;
const CANVAS = '#openfl-content canvas';

const raf = window.requestAnimationFrame.bind(window);

let app: LimeApp | undefined;
let capture: Promise<LimeApp | undefined> | undefined;
let failureLogged = false;

const isApp = (v: unknown): v is LimeApp => {
  const o = v as Partial<LimeApp> | null | undefined;
  return typeof o === 'object' && o !== null && !!o.stage && !!o.renderer && !!o.window;
};

/** Who called requestAnimationFrame: V8 hands out call sites through Error.prepareStackTrace; elsewhere null. */
function callers(): unknown[] | null {
  const E = Error as ErrorConstructor & { prepareStackTrace?: (error: Error, sites: CallSite[]) => unknown };
  const previous = E.prepareStackTrace;
  let sites: unknown;
  try {
    E.prepareStackTrace = (_error, s) => s;
    sites = new Error().stack;
  } finally {
    E.prepareStackTrace = previous;
  }
  if (!Array.isArray(sites)) return null;
  return sites.map((site: CallSite) => {
    try {
      return site.getThis();
    } catch {
      return undefined; // strict mode frames refuse
    }
  });
}

/**
 * The game re-requests its frame every frame with the Lime app as `this`. A temporary wrapper around
 * requestAnimationFrame looks at the callers until it sees the app, then restores the original.
 * V8 hides `this` below a strict mode frame, so this module is built without "use strict" (build.mjs).
 */
function captureEngine(): Promise<LimeApp | undefined> {
  if (app) return Promise.resolve(app);
  capture ??= new Promise((resolve) => {
    const original = window.requestAnimationFrame;
    let frames = 0;
    const done = (found: LimeApp | undefined) => {
      window.requestAnimationFrame = original;
      app = found;
      capture = undefined;
      resolve(found);
    };
    window.requestAnimationFrame = function (this: unknown, callback: FrameRequestCallback) {
      const seen = callers();
      const found = seen?.find(isApp);
      if (found || seen === null || ++frames >= CAPTURE_FRAMES) done(found);
      return original.call(window, callback);
    } as typeof window.requestAnimationFrame;
  });
  return capture;
}

/**
 * The iso scene of the city view the game shows now, or undefined in other views. Looked up fresh every frame. Other
 * views (research, continent map, expedition, battlegrounds) lie beside the city view, which stays but turns invisible
 * (seen 2026-10-25). The game keeps the one scene for the own and visited cities; which city it shows, the content script
 * knows from the game traffic. A game window (market, inventory, army) shows in the window container, over the city;
 * the arrows hide meanwhile, since the game sends nothing when it closes (seen 2026-10-25).
 */
function currentScene(): IsoScene | undefined {
  for (const child of app?.stage.__children ?? []) {
    if (child?.__visible === false || child?.gameContainer?.__visible === false) continue;
    if (child?.windowContainer?.__children?.some((w) => w?.__visible !== false)) return undefined;
    for (const view of child?.gameContainer?.__children ?? []) {
      if (view?.__visible === false) continue;
      const scene = view?._isoScene;
      if (scene && typeof scene.isoToScreen === 'function' && scene._camera) return scene;
    }
  }
  return undefined;
}

const offset = arrowOffset();
// colours of the toolbox boxes (content ui/styles.ts), so the button looks like the rest of the toolbox
const STYLE = `
:host { all: initial; }
.layer { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
.arrow { position: absolute; left: 0; top: 0; will-change: transform; transform-origin: 0 0; }
.arrow[hidden], .clear[hidden] { display: none; }
.arrow svg { position: absolute; left: ${offset.x}px; top: ${offset.y}px; filter: drop-shadow(0 3px 4px #0008);
  animation: bob 1.2s ease-in-out infinite; }
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-${ARROW.bob}px); } }
.clear { position: fixed; top: 88px; right: 70px; width: 32px; height: 32px; display: grid; place-items: center;
  padding: 0; cursor: pointer; pointer-events: auto; color: #fbf4e4; background: #2b1d10; border: 2px solid #8a6a3a;
  border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
.clear:hover { background: #4a3620; }
.clear:focus-visible { outline: none; border-color: #e8861c; }
.clear svg { display: block; width: 18px; height: 18px; }
`;

// a golden arrow pointing down, its tip at the bottom middle; drawn on 46 × 54 and shown twice that size
const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${ARROW.width}" height="${ARROW.height}" viewBox="0 0 46 54">
<defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#f5c932"/><stop offset="1" stop-color="#b87a04"/>
</linearGradient></defs>
<path d="M16 2.5h14v24h11.5L23 51.5 4.5 26.5H16z" fill="url(#gold)" stroke="#5c3a00" stroke-width="2.4"
  stroke-linejoin="round"/>
<path d="M19 6h3v21h-3z" fill="#fffbe0" opacity=".55"/>
</svg>`;

// a cross on the 24 grid of the toolbox icons (content ui/icons.ts, `close`)
const CLOSE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

interface Marker {
  spot: MarkerSpot;
  el: HTMLElement;
}

let layer: HTMLElement | undefined;
let clearButton: HTMLButtonElement | undefined;
let markers: Marker[] = [];
/** the marking the arrows belong to, as the content script numbered it */
let seq = 0;
let looping = false;
let missingSceneLogged = false;
/** counts commands, so a show that waited for the engine yields to anything that came meanwhile */
let generation = 0;
function report(ids: number[]) {
  if (ids.length === 0) return;
  const event: MarkerEvent = { tag: MARKER_TAG, from: 'marker', type: 'removed', seq, ids };
  window.postMessage(event, location.origin);
}

function ensureLayer(): HTMLElement {
  if (layer) return layer;
  const host = document.createElement('div');
  // the game container sits at z-index 100; same level, later in the document, paints above the canvas
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:100;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  layer = document.createElement('div');
  layer.className = 'layer';
  clearButton = document.createElement('button');
  clearButton.className = 'clear';
  clearButton.hidden = true;
  clearButton.innerHTML = CLOSE_SVG;
  clearButton.addEventListener('click', () => {
    const ids = markers.map((m) => m.spot.id);
    clear();
    report(ids);
  });
  shadow.append(style, layer, clearButton);
  document.body.append(host);
  return layer;
}

function clear() {
  for (const m of markers) m.el.remove();
  markers = [];
  if (clearButton) clearButton.hidden = true;
}

async function show(command: Extract<MarkerCommand, { type: 'show' }>) {
  const mine = ++generation;
  clear();
  seq = command.seq;
  if (command.spots.length === 0) return;
  const engine = await captureEngine();
  if (mine !== generation) return;
  if (!engine) {
    if (!failureLogged) logError('building marker: the game engine could not be captured, no arrows');
    failureLogged = true;
    report(command.spots.map((s) => s.id));
    return;
  }
  const parent = ensureLayer();
  if (clearButton) {
    clearButton.title = command.clearLabel;
    clearButton.setAttribute('aria-label', command.clearLabel);
  }
  markers = command.spots.map((spot) => {
    const el = document.createElement('div');
    el.className = 'arrow';
    el.hidden = true;
    el.innerHTML = ARROW_SVG;
    parent.append(el);
    return { spot, el };
  });
  missingSceneLogged = false;
  if (!looping) {
    looping = true;
    raf(tick);
  }
}

function tick() {
  if (markers.length === 0) {
    looping = false;
    return;
  }
  try {
    place();
  } catch (error) {
    // a broken projection must not throw every frame; drop the markers and stop
    logError('building marker: placing the arrows failed', error);
    const ids = markers.map((m) => m.spot.id);
    clear();
    report(ids);
  }
  raf(tick);
}

function canvasBox(canvas: HTMLCanvasElement): CanvasBox {
  const r = canvas.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** a grid point of the scene in viewport pixels */
function project(scene: IsoScene, box: CanvasBox, point: Point): Point {
  return stageToViewport(scene.isoToScreen(point.x, point.y), box, cssPerStage(box, app?.stage.stageWidth));
}

function place() {
  const scene = currentScene();
  const canvas = document.querySelector<HTMLCanvasElement>(CANVAS);
  // another view over the city: the arrows wait, hidden, and come back with the city
  if (!scene || !canvas) {
    if (!scene && !missingSceneLogged) logInfo('building marker: no city scene in the current view');
    missingSceneLogged = true;
    for (const m of markers) m.el.hidden = true;
    if (clearButton) clearButton.hidden = true;
    return;
  }
  const box = canvasBox(canvas);
  const scale = arrowScale(scene._zoomFactor);
  for (const m of markers) {
    const p = project(scene, box, anchorOf(m.spot));
    const visible = Number.isFinite(p.x) && Number.isFinite(p.y) && nearCanvas(p, box);
    m.el.hidden = !visible;
    if (visible) m.el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${scale})`;
  }
  if (clearButton) clearButton.hidden = false;
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || (event.data as { tag?: unknown } | null)?.tag !== MARKER_TAG) return;
  const command = parseMarkerCommand(event.data);
  if (!command) return;
  if (command.type === 'hide') {
    generation++;
    clear();
  } else show(command).catch((error) => logError('building marker: showing failed', error));
});
