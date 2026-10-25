// Content script (isolated world) and marker module (MAIN world) talk over window.postMessage, like the proxy link.
// Page scripts can post the same messages, so each side accepts only what its parser lets through.

export const MARKER_TAG = 'forge-toolbox-marker';

/** A building's footprint on the city grid: `width` along x, `length` along y from its top left tile. */
export interface GridRect {
  x: number;
  y: number;
  width: number;
  length: number;
}

/** One arrow: the building it points at (its id in the city) and its footprint. */
export interface MarkerSpot extends GridRect {
  id: number;
}

/**
 * `show` replaces all arrows. `seq` names this marking; the page echoes it when the viewer removes arrows, so a late
 * echo of an older marking changes nothing. `settle`: the content script shows the arrows because the city changed;
 * the game may still be switching its view, so the page binds them to the view that settles. `clearLabel` is the
 * word of the button that removes all arrows (the texts live in the content script).
 */
export type MarkerCommand =
  | {
      tag: typeof MARKER_TAG;
      from: 'content';
      type: 'show';
      seq: number;
      settle: boolean;
      clearLabel: string;
      spots: MarkerSpot[];
    }
  | { tag: typeof MARKER_TAG; from: 'content'; type: 'hide' };

/** The page removed these arrows of marking `seq`: the viewer dismissed them, the game view changed, or it failed. */
export type MarkerEvent = { tag: typeof MARKER_TAG; from: 'marker'; type: 'removed'; seq: number; ids: number[] };

/** more arrows than this are no marking any more */
export const MAX_MARKERS = 200;
/** the city grid stays well inside this; anything further out is not a building */
const MAX_COORD = 1000;
const MAX_SIZE = 50;
const MAX_LABEL = 100;

const isCoord = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;
const isSize = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_SIZE;
const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

function toSpot(value: unknown): MarkerSpot | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, x, y, width, length } = value as Record<string, unknown>;
  if (!isId(id) || !isCoord(x) || !isCoord(y) || !isSize(width) || !isSize(length)) return null;
  return { id, x: x as number, y: y as number, width: width as number, length: length as number };
}

const fields = (data: unknown, from: string): Record<string, unknown> | null => {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  return d.tag === MARKER_TAG && d.from === from ? d : null;
};

/** The command in a posted message, or null when it is none or malformed. Copies, so later changes do not leak in. */
export function parseMarkerCommand(data: unknown): MarkerCommand | null {
  const d = fields(data, 'content');
  if (!d) return null;
  if (d.type === 'hide') return { tag: MARKER_TAG, from: 'content', type: 'hide' };
  if (d.type !== 'show' || !isId(d.seq) || typeof d.settle !== 'boolean') return null;
  if (typeof d.clearLabel !== 'string' || d.clearLabel.length > MAX_LABEL) return null;
  if (!Array.isArray(d.spots) || d.spots.length > MAX_MARKERS) return null;
  const spots: MarkerSpot[] = [];
  for (const s of d.spots) {
    const spot = toSpot(s);
    if (!spot) return null;
    spots.push(spot);
  }
  return {
    tag: MARKER_TAG,
    from: 'content',
    type: 'show',
    seq: d.seq,
    settle: d.settle,
    clearLabel: d.clearLabel,
    spots,
  };
}

/** The event in a posted message, or null when it is none or malformed. */
export function parseMarkerEvent(data: unknown): MarkerEvent | null {
  const d = fields(data, 'marker');
  if (d?.type !== 'removed' || !isId(d.seq)) return null;
  if (!Array.isArray(d.ids) || d.ids.length > MAX_MARKERS || !d.ids.every(isId)) return null;
  return { tag: MARKER_TAG, from: 'marker', type: 'removed', seq: d.seq, ids: [...d.ids] };
}
