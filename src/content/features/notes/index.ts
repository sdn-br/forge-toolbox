import type { Feature } from '../../core/feature';
import { t } from '../../core/texts';
import { ALL_REACH } from '../../domain/reach';
import { PLAYER_GROUP, playerPageId } from '../../stores/notes';
import { icons } from '../../ui/icons';
import { NoteEditor } from '../../ui/note-editor';
import { notesCss } from './styles';
import { type NotesActions, notesView } from './view';
import { type NotesUi, type NotesVm, notesViewModel } from './view-model';

export const notesFeature: Feature = {
  id: 'notes',
  setup(ctx) {
    const { notes } = ctx;
    const ui: NotesUi = { group: PLAYER_GROUP, search: '', relation: ALL_REACH, addingGroup: false };
    let dragging: { kind: 'group' | 'page'; id: string } | undefined;

    const viewModel = (): NotesVm =>
      notesViewModel({
        ui,
        world: ctx.world,
        groups: notes.groups(),
        pages: notes.allPages(),
        player: (id) => ctx.players.get(id),
        players: ui.picker === undefined ? [] : ctx.players.list().filter((p) => p.world === ctx.world),
        me: ctx.session.current?.playerId,
        now: Date.now(),
      });

    const render = () => {
      const vm = viewModel();
      // what the box shows is what stays selected, also after the active page or group is gone
      ui.group = vm.tabs.find((tab) => tab.active)?.id ?? PLAYER_GROUP;
      ui.page = vm.page?.id;
      return notesView(vm, vm.page && editorFor(vm.page), actions);
    };

    const box = ctx.createBox({
      id: 'notes',
      title: () => t('notes.title'),
      width: 520,
      resizable: true,
      css: notesCss,
      render,
    });
    const editor = new NoteEditor(() => box.update());

    const editorFor = (page: NonNullable<NotesVm['page']>) =>
      editor.render({
        key: page.id,
        text: page.text,
        placeholder: t(page.player ? 'notes.playerPlaceholder' : 'notes.placeholder'),
        save: (text) => {
          if (page.player) notes.setPlayerText(page.player.id, text, page.player.name);
          else notes.setText(page.id, text);
        },
      });

    const set = (patch: Partial<NotesUi>) => {
      Object.assign(ui, patch);
      box.update();
    };

    const actions: NotesActions = {
      search: (search) => set({ search }),
      openResult: (r) => set({ search: '', group: r.group, page: r.page, picker: undefined, confirm: undefined }),
      group: (group) => {
        if (group !== ui.group) set({ group, page: undefined, confirm: undefined, renaming: undefined });
      },
      startAddGroup: () => set({ addingGroup: true, renaming: undefined }),
      addGroup: (name) => {
        if (!ui.addingGroup) return;
        ui.addingGroup = false;
        const trimmed = name.trim();
        if (!trimmed) return box.update();
        set({ group: notes.addGroup(trimmed).id, page: undefined });
      },
      startRename: (kind, id) => set({ renaming: { kind, id }, addingGroup: false }),
      rename: (name) => {
        const renaming = ui.renaming;
        if (!renaming) return;
        ui.renaming = undefined;
        const trimmed = name.trim();
        if (trimmed && renaming.kind === 'group') notes.renameGroup(renaming.id, trimmed);
        if (trimmed && renaming.kind === 'page') notes.renamePage(renaming.id, trimmed);
        box.update();
      },
      cancel: () => set({ addingGroup: false, renaming: undefined, confirm: undefined, picker: undefined }),
      page: (page) => set({ page }),
      addPage: () => {
        const page = notes.addPage(ui.group, t('notes.newPage'));
        if (page) set({ page: page.id, renaming: { kind: 'page', id: page.id } });
      },
      renamePage: (id, title) => notes.renamePage(id, title),
      askDelete: (kind, id) => set({ confirm: { kind, id } }),
      confirmDelete: () => {
        const confirm = ui.confirm;
        ui.confirm = undefined;
        if (confirm?.kind === 'group') notes.deleteGroup(confirm.id);
        if (confirm?.kind === 'page') {
          notes.deletePage(confirm.id);
          // a deleted player page would stay selected as an empty draft and look as if nothing happened
          if (ui.page === confirm.id) ui.page = undefined;
        }
        box.update();
      },
      relation: (relation) => set({ relation }),
      openPicker: () => set({ picker: '', confirm: undefined }),
      pickerSearch: (picker) => set({ picker }),
      pick: (player) =>
        set({ picker: undefined, group: PLAYER_GROUP, page: playerPageId(player), relation: ALL_REACH, search: '' }),
      drag: (kind, id) => {
        dragging = { kind, id };
      },
      drop: (kind, target) => {
        const moved = dragging;
        dragging = undefined;
        if (!moved || moved.kind !== kind || moved.id === target) return;
        if (kind === 'group')
          notes.moveGroup(
            moved.id,
            notes.groups().findIndex((g) => g.id === target),
          );
        else
          notes.movePage(
            moved.id,
            notes.pages(ui.group).findIndex((p) => p.id === target),
          );
      },
    };

    ctx.bus.on('note.changed', () => box.update());
    // names, guilds and relations of players come live from the player store
    ctx.bus.on('player.updated', () => box.update());
    ctx.menu.add({ id: 'notes', icon: icons.notes, label: () => t('menu.notes'), action: () => box.toggle() });
  },
};
