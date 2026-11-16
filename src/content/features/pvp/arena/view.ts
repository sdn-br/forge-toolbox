import { html } from 'lit-html';
import { t } from '../../../core/texts';
import { headerIcons } from '../../../ui/icons';
import type { RowWindow } from '../../../ui/windowed-rows';
import { selectOnClick } from '../battles/view';
import { listView, noteMarker, opponentCell, type PvpActions, rowsShown } from '../rows';
import type { ArenaRow, ArenaVm } from './view-model';

/** an attack as the result icon of the battles in its colour, a defense as a word (no icon yet); the word in tooltip
 * and label */
const resultCell = (r: ArenaRow) =>
  r.outcome === 'defense'
    ? html`<td class="pvp-result defense" data-tip=${r.result}>${t('pvp.arena.defenseShort')}</td>`
    : html`<td class=${`pvp-result ${r.outcome}`}><span role="img" data-tip=${r.result} aria-label=${r.result}>${headerIcons[r.outcome]}</span></td>`;

const cells = (r: ArenaRow, actions: PvpActions) =>
  html`${noteMarker(r.opponent, r.note, actions)}${opponentCell(r, actions)}<td>${r.when}</td>${resultCell(r)}<td class=${`pvp-points ${r.gain}`}>${r.points}</td>`;

/** a row with a stored battle selects it for the side panel, any other row is plain */
const row = (r: ArenaRow, actions: PvpActions) =>
  r.battleId === undefined
    ? html`<tr>${cells(r, actions)}</tr>`
    : html`<tr class=${r.selected ? 'battle-row selected' : 'battle-row'} data-tip=${t(r.selected ? 'pvp.unselect' : 'pvp.arena.select')}
    @click=${selectOnClick(r.battleId, actions)}>${cells(r, actions)}</tr>`;

const table = (vm: ArenaVm, window: RowWindow, actions: PvpActions) => {
  const result = t('pvp.result');
  return html`<table class="pvp-table pvp-arena">
    <colgroup><col class="c-note" /><col /><col class="c-when" /><col class="c-arena-result" /><col class="c-points" /></colgroup>
    <thead><tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th class="pvp-result" data-tip=${result} aria-label=${result}>${headerIcons.won}</th>
      <th class="pvp-points">${t('pvp.arena.points')}</th></tr></thead>
    <tbody>${rowsShown(vm.rows, vm.from, vm.total, window).map((r) => row(r, actions))}</tbody>
  </table>`;
};

export const arenaView = (vm: ArenaVm, window: RowWindow, actions: PvpActions) =>
  listView(vm, window, actions, { none: 'pvp.arena.none', noMatch: 'pvp.arena.noMatch' }, table(vm, window, actions));
