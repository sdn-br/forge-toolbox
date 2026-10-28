import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { t } from '../../core/texts';
import { iconButton } from '../../ui/buttons';
import { headerIcons } from '../../ui/icons';
import { autofocus, keepKeys } from '../../ui/inputs';
import { externalLink } from '../../ui/links';
import type { NotesVm, PageVm, PickerVm, RelationFilter, ResultVm, RowVm, TabVm } from './view-model';
import { RELATION_FILTERS } from './view-model';

export interface NotesActions {
  search(text: string): void;
  openResult(result: ResultVm): void;
  group(id: string): void;
  startAddGroup(): void;
  addGroup(name: string): void;
  startRename(kind: 'group' | 'page', id: string): void;
  rename(name: string): void;
  cancel(): void;
  page(id: string): void;
  addPage(): void;
  renamePage(id: string, title: string): void;
  askDelete(kind: 'group' | 'page', id: string): void;
  confirmDelete(): void;
  relation(filter: RelationFilter): void;
  openPicker(): void;
  pickerSearch(text: string): void;
  pick(player: PlayerId): void;
  drag(kind: 'group' | 'page', id: string): void;
  drop(kind: 'group' | 'page', id: string): void;
}

const value = (e: Event) => (e.target as HTMLInputElement).value;

/** Enter or leaving the field saves, Escape cancels; the actions ignore whatever comes after the first. */
const inlineField = (current: string, save: (v: string) => void, cancel: () => void, placeholder = '') =>
  html`<input class="inline" .value=${current} placeholder=${placeholder} ${autofocus}
    @keydown=${(e: KeyboardEvent) => {
      keepKeys(e);
      if (e.key === 'Enter') save(value(e));
      if (e.key === 'Escape') cancel();
    }}
    @keyup=${keepKeys}
    @blur=${(e: Event) => save(value(e))} />`;

/** drag handlers for a row or tab that can be moved; dropping on another one moves it to that place */
const draggable = (kind: 'group' | 'page', id: string, actions: NotesActions) => ({
  start: (e: DragEvent) => {
    e.dataTransfer?.setData('text/plain', id);
    actions.drag(kind, id);
  },
  over: (e: DragEvent) => e.preventDefault(),
  drop: (e: DragEvent) => {
    e.preventDefault();
    actions.drop(kind, id);
  },
});

function tab(tab: TabVm, actions: NotesActions) {
  if (tab.renaming) return inlineField(tab.name, actions.rename, actions.cancel);
  const label = tab.active ? 'active' : '';
  if (tab.fixed) return html`<button class=${label} @click=${() => actions.group(tab.id)}>${tab.name}</button>`;
  const d = draggable('group', tab.id, actions);
  return html`<button class=${label} draggable="true" data-tip=${t('notes.rename')}
    @click=${() => actions.group(tab.id)} @dblclick=${() => actions.startRename('group', tab.id)}
    @dragstart=${d.start} @dragover=${d.over} @drop=${d.drop}>${tab.name}</button>`;
}

const tabs = (vm: NotesVm, actions: NotesActions) => html`<nav class="tabs">
  ${vm.tabs.map((each) => tab(each, actions))}
  ${
    vm.addingGroup
      ? inlineField('', actions.addGroup, actions.cancel, t('notes.groupName'))
      : html`<button data-tip=${t('notes.addGroup')} aria-label=${t('notes.addGroup')} @click=${actions.startAddGroup}>${headerIcons.plus}</button>`
  }</nav>`;

function row(r: RowVm, playerGroup: boolean, actions: NotesActions) {
  if (r.renaming) return html`<li>${inlineField(r.title, actions.rename, actions.cancel)}</li>`;
  const content = html`${r.icons ? html`${r.icons} ` : ''}${r.title}
    ${r.when ? html`<br /><span class="muted">${r.when}</span>` : ''}`;
  const classes = `${r.active ? 'active' : ''} ${r.draft ? 'muted' : ''}`;
  if (playerGroup) return html`<li class=${classes} @click=${() => actions.page(r.id)}>${content}</li>`;
  const d = draggable('page', r.id, actions);
  return html`<li class=${classes} draggable="true" data-tip=${t('notes.rename')}
    @click=${() => actions.page(r.id)} @dblclick=${() => actions.startRename('page', r.id)}
    @dragstart=${d.start} @dragover=${d.over} @drop=${d.drop}>${content}</li>`;
}

function side(vm: NotesVm, actions: NotesActions) {
  const head = vm.playerGroup
    ? html`<select @change=${(e: Event) => actions.relation(value(e) as RelationFilter)}>
          ${RELATION_FILTERS.map((f) => html`<option value=${f} .selected=${vm.relation === f}>${t(`notes.filter.${f}`)}</option>`)}
        </select>
        ${iconButton(t('notes.addPlayer'), actions.openPicker, headerIcons.personPlus, 'action icon-only')}`
    : html`${iconButton(t('notes.addPage'), actions.addPage, headerIcons.notePlus, 'action icon-only')}`;
  const active = vm.tabs.find((each) => each.active);
  return html`<div class="side">${head}
    ${vm.empty ? html`<p class="muted">${t(`notes.${vm.empty}`)}</p>` : ''}
    <ul class="rows">${vm.rows.map((r) => row(r, vm.playerGroup, actions))}</ul>
    ${
      active && !active.fixed
        ? html`${iconButton(t('notes.deleteGroup'), () => actions.askDelete('group', active.id), headerIcons.trash, 'action icon-only')}`
        : ''
    }</div>`;
}

function pageHead(page: PageVm, actions: NotesActions) {
  if (page.player) {
    const p = page.player;
    const guild = p.guild ? html`<br /><span class="muted">[${externalLink(p.guild.name, p.guild.url)}]</span>` : '';
    return html`<p><b>${externalLink(p.name, p.url)}</b> ${p.icons}${guild}
      ${page.when ? html`<br /><span class="muted">${t('notes.changed', { when: page.when })}</span>` : ''}</p>`;
  }
  return html`<p><input class="title" .value=${page.title}
      @keydown=${(e: KeyboardEvent) => {
        keepKeys(e);
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      @keyup=${keepKeys}
      @change=${(e: Event) => {
        const input = e.target as HTMLInputElement;
        // an empty title is not taken, the field shows the old one again
        if (input.value.trim()) actions.renamePage(page.id, input.value.trim());
        else input.value = page.title;
      }} />
    ${page.when ? html`<span class="muted">${t('notes.changed', { when: page.when })}</span>` : ''}</p>`;
}

function main(vm: NotesVm, editor: TemplateResult | undefined, actions: NotesActions) {
  const page = vm.page;
  if (!page) return html`<div class="main"></div>`;
  return html`<div class="main">${pageHead(page, actions)}${editor}
    ${
      page.stored
        ? html`${iconButton(t('notes.deletePage'), () => actions.askDelete('page', page.id), headerIcons.trash, 'action icon-only')}`
        : ''
    }</div>`;
}

const results = (list: ResultVm[], actions: NotesActions) =>
  list.length === 0
    ? html`<p class="muted">${t('notes.noResults')}</p>`
    : html`<ul class="rows">${list.map(
        (r) => html`<li @click=${() => actions.openResult(r)}>
          <span class="muted">${r.groupName} ›</span> <b>${r.title}</b><br /><span class="muted">${r.snippet}</span></li>`,
      )}</ul>`;

const picker = (p: PickerVm, actions: NotesActions) => html`<div class="card">
  <h2>${t('notes.addPlayer')}</h2>
  <p><input type="search" placeholder=${t('notes.pickPlayer')} .value=${p.text} ${autofocus}
    @input=${(e: Event) => actions.pickerSearch(value(e))}
    @keydown=${(e: KeyboardEvent) => {
      keepKeys(e);
      const first = p.rows[0];
      if (e.key === 'Enter' && first) actions.pick(first.id);
      if (e.key === 'Escape') actions.cancel();
    }}
    @keyup=${keepKeys} />
    ${iconButton(t('notes.close'), actions.cancel, headerIcons.close, 'action icon-only')}</p>
  ${p.rows.length === 0 ? html`<p class="muted">${t('notes.noPlayerFound')}</p>` : ''}
  <ul class="rows">${p.rows.map(
    (
      r,
    ) => html`<li @click=${() => actions.pick(r.id)}>${r.hasPage ? html`<span class="page-mark">${headerIcons.note}</span> ` : ''}${r.name}
      ${r.guild ? html`<span class="muted">[${r.guild}]</span>` : ''}</li>`,
  )}</ul>
  ${p.more ? html`<p class="muted">${t('notes.morePlayers')}</p>` : ''}</div>`;

/** `editor` is the note editor of the active page, drawn by the feature, which owns its state */
export function notesView(vm: NotesVm, editor: TemplateResult | undefined, actions: NotesActions): TemplateResult {
  const search = html`<p><input type="search" placeholder=${t('notes.search')} .value=${vm.search}
    @input=${(e: Event) => actions.search(value(e))} @keydown=${keepKeys} @keyup=${keepKeys} /></p>`;
  const confirm = vm.confirm
    ? html`<p class="warn">${vm.confirm}
        <button class="action" @click=${actions.confirmDelete}>${t('notes.delete')}</button>
        <button class="action" @click=${actions.cancel}>${t('notes.cancel')}</button></p>`
    : '';
  // the search field stays in one outer template: swapping templates would replace it and take its focus mid-typing
  const body = vm.results
    ? results(vm.results, actions)
    : vm.picker
      ? html`${tabs(vm, actions)}${picker(vm.picker, actions)}`
      : html`${tabs(vm, actions)}${confirm}
          <div class="split">${side(vm, actions)}${main(vm, editor, actions)}</div>`;
  return html`${search}${body}`;
}
