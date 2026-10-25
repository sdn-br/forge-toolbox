// Which buildings carry an arrow in the game view. One marking at a time: a new one replaces the old, whoever set it.
// A marking belongs to a city and shows only while the game shows that city (CityStore.shown). The marker module in
// the page draws it and reports the arrows the viewer dismissed there.
import { MARKER_TAG, type MarkerCommand, type MarkerSpot } from '../../shared/marker-protocol';
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
  private marking?: Marking;
  /** numbers the markings; the page echoes it, so a late echo of an older marking changes nothing */
  private seq = 0;
  /** whether the page was last told to show arrows */
  private showing = false;

  constructor(
    private bus: ToolboxBus,
    private cities: { shown(): CityKey },
    private link: MarkerLink,
  ) {
    link.onRemoved((seq, ids) => this.removed(seq, ids));
    // the city changed: hide a marking of another city, show one of this city again; the game may still be switching
    bus.on('city.shown', () => this.sync(true));
  }

  current(): Readonly<Marking> | undefined {
    return this.marking;
  }

  /** whether building `id` of `city` carries an arrow that feature `by` set */
  has(by: string, city: CityKey, id: number): boolean {
    const m = this.marking;
    return m?.by === by && m.city === city && m.spots.some((s) => s.id === id);
  }

  /** Arrows on these buildings of `city`, replacing any marking. None clears what `by` marked. */
  set(by: string, city: CityKey, spots: MarkerSpot[]): void {
    if (spots.length === 0) {
      this.clear(by);
      return;
    }
    this.seq++;
    this.marking = { by, city, spots: spots.map(({ id, x, y, width, length }) => ({ id, x, y, width, length })) };
    this.sync(false);
    this.bus.emit('markers.changed', {});
  }

  /** Removes the marking; with `by` only when that feature set it. */
  clear(by?: string): void {
    if (!this.marking || (by !== undefined && this.marking.by !== by)) return;
    this.marking = undefined;
    this.sync(false);
    this.bus.emit('markers.changed', {});
  }

  private sync(settle: boolean) {
    const m = this.marking;
    if (m && m.city === this.cities.shown()) {
      this.link.post({
        tag: MARKER_TAG,
        from: 'content',
        type: 'show',
        seq: this.seq,
        settle,
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
    const m = this.marking;
    if (!m || seq !== this.seq) return;
    const spots = m.spots.filter((s) => !ids.includes(s.id));
    if (spots.length === m.spots.length) return;
    if (spots.length === 0) {
      this.marking = undefined;
      this.showing = false;
    } else this.marking = { ...m, spots };
    this.bus.emit('markers.changed', {});
  }
}
