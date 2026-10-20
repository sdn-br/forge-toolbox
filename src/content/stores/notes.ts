import type { NoteChanges } from '../../persistence/notes/contract';
import { type PlayerId, playerId, type WorldId } from '../../shared/ids';
import type { NoteGroup, NotePage } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';

export interface NotePersistence {
  load(world: WorldId): Promise<{ groups: NoteGroup[]; pages: NotePage[] }>;
  save(changes: NoteChanges): Promise<void>;
}

/** The group of the player pages. It is not stored and cannot be renamed, deleted or moved. */
export const PLAYER_GROUP = 'players';

export const playerPageId = (player: PlayerId) => `player:${player}`;

/** the player of a player page id, also when that page is not stored */
export function playerOfPage(id: string | undefined): PlayerId | undefined {
  const match = id?.match(/^player:(\d+)$/);
  return match ? playerId(Number(match[1])) : undefined;
}

const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

/** Notes of one world. All of them live in memory, the store writes changes to the database in the background. */
export class NoteStore {
  private groupRows = new Map<string, NoteGroup>();
  private pageRows = new Map<string, NotePage>();
  private dirtyGroups = new Set<string>();
  private dirtyPages = new Set<string>();
  private deletedGroups = new Set<string>();
  private deletedPages = new Set<string>();
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: NotePersistence,
    private now: () => number = Date.now,
    private newId: () => string = () => crypto.randomUUID(),
  ) {}

  async load(): Promise<void> {
    const { groups, pages } = await this.persistence.load(this.world);
    for (const g of groups) if (!this.groupRows.has(g.id)) this.groupRows.set(g.id, g);
    for (const p of pages) if (!this.pageRows.has(p.id)) this.pageRows.set(p.id, p);
  }

  /** the stored groups in their order, without the player group */
  groups(): NoteGroup[] {
    return [...this.groupRows.values()].sort(bySort);
  }

  group(id: string): NoteGroup | undefined {
    return this.groupRows.get(id);
  }

  /** the pages of a group in their order */
  pages(group: string): NotePage[] {
    return this.allPages()
      .filter((p) => p.group === group)
      .sort(bySort);
  }

  allPages(): NotePage[] {
    return [...this.pageRows.values()];
  }

  page(id: string): NotePage | undefined {
    return this.pageRows.get(id);
  }

  playerPage(player: PlayerId): NotePage | undefined {
    return this.pageRows.get(playerPageId(player));
  }

  /** a new group goes to the end */
  addGroup(name: string): NoteGroup {
    const sort = Math.max(-1, ...this.groups().map((g) => g.sort)) + 1;
    const group = { world: this.world, id: this.newId(), name, sort };
    this.putGroup(group);
    this.changed();
    return group;
  }

  renameGroup(id: string, name: string): void {
    const group = this.groupRows.get(id);
    if (!group || group.name === name) return;
    this.putGroup({ ...group, name });
    this.changed();
  }

  /** deletes the group with all its pages */
  deleteGroup(id: string): void {
    if (!this.groupRows.delete(id)) return;
    this.dirtyGroups.delete(id);
    this.deletedGroups.add(id);
    for (const page of this.pages(id)) this.dropPage(page.id);
    this.scheduleFlush();
    this.changed();
  }

  /** moves a group to the place `to` in the order of the groups */
  moveGroup(id: string, to: number): void {
    const moved = this.reorder(this.groups(), id, to);
    for (const group of moved) this.putGroup(group);
    if (moved.length) this.changed();
  }

  /** a new page goes to the top of its group; the player group takes no normal pages */
  addPage(group: string, title: string): NotePage | undefined {
    if (group === PLAYER_GROUP || !this.groupRows.has(group)) return undefined;
    const sort = Math.min(1, ...this.pages(group).map((p) => p.sort)) - 1;
    const page = { world: this.world, id: this.newId(), group, title, text: '', sort, updatedAt: this.now() };
    this.putPage(page);
    this.changed();
    return page;
  }

  renamePage(id: string, title: string): void {
    const page = this.pageRows.get(id);
    if (!page || page.player !== undefined || page.title === title) return;
    this.putPage({ ...page, title, updatedAt: this.now() });
    this.changed();
  }

  /** Unchanged text is not saved again. An emptied player page is deleted, a normal page keeps its title. */
  setText(id: string, text: string): void {
    const page = this.pageRows.get(id);
    if (!page || page.text === text) return;
    if (page.player !== undefined && !text.trim()) {
      this.deletePage(id);
      return;
    }
    this.putPage({ ...page, text, updatedAt: this.now() });
    this.changed(page.player);
  }

  deletePage(id: string): void {
    const page = this.pageRows.get(id);
    if (!page) return;
    this.dropPage(id);
    this.scheduleFlush();
    this.changed(page.player);
  }

  /** moves a page to the place `to` in the order of its group */
  movePage(id: string, to: number): void {
    const page = this.pageRows.get(id);
    if (!page || page.group === PLAYER_GROUP) return;
    const moved = this.reorder(this.pages(page.group), id, to);
    for (const p of moved) this.putPage(p);
    if (moved.length) this.changed();
  }

  /** The note of a player: text creates the page, an empty text deletes it. `name` is kept for display only. */
  setPlayerText(player: PlayerId, text: string, name?: string): void {
    const page = this.playerPage(player);
    if (page) {
      if (name && name !== page.title) this.putPage({ ...page, title: name });
      this.setText(page.id, text);
      return;
    }
    if (!text.trim()) return;
    this.putPage({
      world: this.world,
      id: playerPageId(player),
      group: PLAYER_GROUP,
      title: name ?? '',
      text,
      sort: 0,
      updatedAt: this.now(),
      player,
    });
    this.changed(player);
  }

  /** the rows whose place changed when `id` moves to `to`, renumbered from 0 */
  private reorder<T extends { id: string; sort: number }>(rows: T[], id: string, to: number): T[] {
    const from = rows.findIndex((r) => r.id === id);
    if (from < 0) return [];
    const order = rows.filter((r) => r.id !== id);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, rows[from] as T);
    return order.flatMap((r, sort) => (r.sort === sort ? [] : [{ ...r, sort }]));
  }

  private putGroup(group: NoteGroup) {
    this.groupRows.set(group.id, group);
    this.deletedGroups.delete(group.id);
    this.dirtyGroups.add(group.id);
    this.scheduleFlush();
  }

  private putPage(page: NotePage) {
    this.pageRows.set(page.id, page);
    this.deletedPages.delete(page.id);
    this.dirtyPages.add(page.id);
    this.scheduleFlush();
  }

  private dropPage(id: string) {
    this.pageRows.delete(id);
    this.dirtyPages.delete(id);
    this.deletedPages.add(id);
  }

  private changed(player?: PlayerId) {
    this.bus.emit('note.changed', player === undefined ? {} : { player });
  }

  /** One write per microtask, in order, so a delete never overtakes the put before it. */
  private scheduleFlush() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      const key = (id: string): [WorldId, string] => [this.world, id];
      const changes: NoteChanges = {
        groups: [...this.dirtyGroups].flatMap((id) => this.groupRows.get(id) ?? []),
        pages: [...this.dirtyPages].flatMap((id) => this.pageRows.get(id) ?? []),
        deletedGroups: [...this.deletedGroups].map(key),
        deletedPages: [...this.deletedPages].map(key),
      };
      this.dirtyGroups.clear();
      this.dirtyPages.clear();
      this.deletedGroups.clear();
      this.deletedPages.clear();
      this.writes = this.writes
        .then(() => this.persistence.save(changes))
        .catch((error) => logError('saving notes failed', error));
    });
  }
}
