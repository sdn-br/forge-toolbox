// Which buildings carry an arrow in the game view. One marking per city: a new one in a city replaces the old there,
// whoever set it, and markings of other cities stay (the own search survives a visit with a plunder arrow). Only the
// marking of the city the game shows (CityStore.shown) is drawn. The marker module in the page draws it and reports the
// arrows the viewer dismissed there.
import { MARKER_TAG, MAX_MARKERS, type MarkerCommand, type MarkerSpot } from '../../shared/marker-protocol';
import type { CityKey } from '../stores/cities';
import type { ToolboxBus } from './events';
import { t } from './texts';

/** The way to the marker module in the page; tests bring their own. */
export interface MarkerLink {
  post(command: MarkerCommand): void;
  /** the page removed these arrows of marking `seq` */
  onRemoved(listener: (seq: number, ids: number[]) => void): void;
}

export interface Marking {
  /** the feature that set it */
  by: string;
  city: CityKey;
  spots: MarkerSpot[];
}

export class Markers {
  private markings = new Map<CityKey, Marking>();
  /** numbers what the page was told to show; it echoes the number, so a late echo of an older show changes nothing */
  private seq = 0;
  /** whether the page was last told to show arrows */
  private showing = false;

  constructor(
    private bus: ToolboxBus,
    private cities: { shown(): CityKey },
    private link: MarkerLink,
  ) {
    link.onRemoved((seq, ids) => this.removed(seq, ids));
    // the city changed: hide the arrows of the city before, show the marking of this city
    bus.on('city.shown', () => this.sync());
  }

  /** the marking of the city the game shows */
  current(): Readonly<Marking> | undefined {
    return this.markings.get(this.cities.shown());
  }

  /** the marking feature `by` set, in whatever city */
  of(by: string): Readonly<Marking> | undefined {
    for (const m of this.markings.values()) if (m.by === by) return m;
    return undefined;
  }

  /** whether building `id` of `city` carries an arrow that feature `by` set */
  has(by: string, city: CityKey, id: number): boolean {
    const m = this.markings.get(city);
    return m?.by === by && m.spots.some((s) => s.id === id);
  }

  /**
   * Arrows on these buildings of `city`, replacing the marking of that city; beyond the first MAX_MARKERS none. None
   * clears what `by` marked there.
   */
  set(by: string, city: CityKey, spots: MarkerSpot[]): void {
    if (spots.length === 0) {
      if (this.markings.get(city)?.by !== by) return;
      this.markings.delete(city);
    } else {
      const kept = spots.slice(0, MAX_MARKERS).map(({ id, x, y, width, length }) => ({ id, x, y, width, length }));
      this.markings.set(city, { by, city, spots: kept });
    }
    this.sync();
    this.bus.emit('markers.changed', {});
  }

  /** Removes the markings feature `by` set, in every city; without `by` all. */
  clear(by?: string): void {
    let removed = false;
    for (const [city, m] of this.markings) {
      if (by !== undefined && m.by !== by) continue;
      this.markings.delete(city);
      removed = true;
    }
    if (!removed) return;
    this.sync();
    this.bus.emit('markers.changed', {});
  }

  private sync() {
    const m = this.current();
    if (m) {
      this.seq++;
      this.link.post({
        tag: MARKER_TAG,
        from: 'content',
        type: 'show',
        seq: this.seq,
        clearLabel: t('marker.clear'),
        spots: m.spots,
      });
      this.showing = true;
    } else if (this.showing) {
      this.link.post({ tag: MARKER_TAG, from: 'content', type: 'hide' });
      this.showing = false;
    }
  }

  private removed(seq: number, ids: number[]) {
    const m = this.current();
    if (!m || seq !== this.seq) return;
    const spots = m.spots.filter((s) => !ids.includes(s.id));
    if (spots.length === m.spots.length) return;
    if (spots.length === 0) {
      this.markings.delete(m.city);
      this.showing = false;
    } else this.markings.set(m.city, { ...m, spots });
    this.bus.emit('markers.changed', {});
  }
}
