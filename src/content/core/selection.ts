// The one selection of buildings in the own city. The building search, the search of the city map and clicks in the
// city map are views on it, and the arrows in the game show exactly it. Kept in memory only: a reload starts empty.
import type { BuildingDefId } from '../../shared/ids';
import { MAX_MARKERS } from '../../shared/marker-protocol';
import { type Footprint, footprints, nameOf, spotOf } from '../domain/city-grid';
import type { BuildingDef } from '../stores/catalog';
import type { City } from '../stores/city-model';
import type { ToolboxBus } from './events';
import type { Markers } from './markers';
import { compareText } from './texts';

/** the marking the selection sets in `Markers` */
export const SELECTION = 'selection';

/** One name in the selection: how many of its buildings are selected, of how many in the city. */
export interface SelectionEntry {
  name: string;
  selected: number;
  total: number;
}

/** The selected buildings grouped by name, each with the number of buildings of that name; sorted by name. */
export function groupSelection(
  buildings: Iterable<{ id: number; name: string }>,
  selected: ReadonlySet<number>,
): SelectionEntry[] {
  const byName = new Map<string, SelectionEntry>();
  for (const { id, name } of buildings) {
    const entry = byName.get(name) ?? { name, selected: 0, total: 0 };
    entry.total++;
    if (selected.has(id)) entry.selected++;
    byName.set(name, entry);
  }
  return [...byName.values()].filter((e) => e.selected > 0).sort((a, b) => compareText(a.name, b.name));
}

export class OwnSelection {
  private selected = new Set<number>();
  /** the spots the arrows were set on last, at most MAX_MARKERS of the selection; setting the same again is skipped */
  private spots: ReturnType<typeof spotOf>[] = [];

  constructor(
    private bus: ToolboxBus,
    private cities: { own(): City | undefined },
    private catalog: { get(id: BuildingDefId): BuildingDef | undefined },
    private markers: Markers,
  ) {
    // buildings that left the own city drop out; sizes and places may have changed
    bus.on('city.ownChanged', () => this.refresh());
    bus.on('catalog.updated', () => this.refresh());
    // the page removed arrows: the viewer dismissed them, or the game view changed
    bus.on('markers.changed', () => this.arrowsChanged());
  }

  /** the buildings on the grid of the own city, in the order the city lists them */
  buildings(): Footprint[] {
    const city = this.cities.own();
    return city ? footprints(city.buildings.values(), (id) => this.catalog.get(id)) : [];
  }

  ids(): ReadonlySet<number> {
    return this.selected;
  }

  entries(): SelectionEntry[] {
    return groupSelection(
      this.buildings().map((f) => ({ id: f.building.id, name: nameOf(f) })),
      this.selected,
    );
  }

  /** adds all buildings of this name; picking never removes */
  addName(name: string): void {
    this.editName(name, (id) => this.selected.add(id));
  }

  removeName(name: string): void {
    this.editName(name, (id) => this.selected.delete(id));
  }

  /** adds the building, or removes it when it is selected */
  toggle(id: number): void {
    const grid = this.buildings();
    if (!onGrid(grid, id)) return;
    if (!this.selected.delete(id)) this.selected.add(id);
    this.changed(grid);
  }

  /** the selection becomes only this building; when it already is only this building, it becomes empty */
  selectOnly(id: number): void {
    const grid = this.buildings();
    if (!onGrid(grid, id)) return;
    const alone = this.selected.size === 1 && this.selected.has(id);
    this.selected.clear();
    if (!alone) this.selected.add(id);
    // never a no-op: from empty the building is added, from anything else the set loses or swaps a member
    this.changed(grid);
  }

  clear(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.changed(this.buildings());
  }

  private editName(name: string, edit: (id: number) => unknown) {
    const grid = this.buildings();
    const before = this.selected.size;
    for (const f of grid) if (nameOf(f) === name) edit(f.building.id);
    // an edit only adds or only removes, so the size tells whether the selection changed
    if (this.selected.size !== before) this.changed(grid);
  }

  private changed(grid: Footprint[]) {
    this.sync(grid);
    this.bus.emit('selection.changed', {});
  }

  private refresh() {
    // nothing selected, no arrows: nothing to drop or to show, the common case on every city update
    if (this.selected.size === 0 && this.spots.length === 0) return;
    const grid = this.buildings();
    const present = new Set(grid.map((f) => f.building.id));
    const gone = [...this.selected].filter((id) => !present.has(id));
    for (const id of gone) this.selected.delete(id);
    this.sync(grid);
    if (gone.length) this.bus.emit('selection.changed', {});
  }

  /** the arrows show the selection; beyond MAX_MARKERS buildings no more arrows */
  private sync(grid: Footprint[]) {
    const spots = grid
      .filter((f) => this.selected.has(f.building.id))
      .slice(0, MAX_MARKERS)
      .map(spotOf);
    if (JSON.stringify(spots) === JSON.stringify(this.spots)) return;
    this.spots = spots;
    // the change this causes in `Markers` finds the arrows as set, so it removes nothing from the selection
    this.markers.set(SELECTION, 'own', spots);
  }

  private arrowsChanged() {
    if (this.spots.length === 0) return;
    const marking = this.markers.of(SELECTION);
    const standing = new Set(marking?.city === 'own' ? marking.spots.map((s) => s.id) : []);
    const removed = this.spots.map((s) => s.id).filter((id) => !standing.has(id));
    if (removed.length === 0) return;
    // no arrow left: the ✕ in the game took them all, also the selected buildings beyond the arrows
    if (standing.size === 0) this.selected.clear();
    else for (const id of removed) this.selected.delete(id);
    this.sync(this.buildings());
    this.bus.emit('selection.changed', {});
  }
}

const onGrid = (grid: Footprint[], id: number) => grid.some((f) => f.building.id === id);
