import { html } from 'lit-html';
import { t } from '../../../core/texts';
import type { RowWindow } from '../../../ui/windowed-rows';
import { listView, noteMarker, opponentCell, type PvpActions, rowsShown } from '../rows';
import type { IncomingRow, IncomingVm } from './view-model';

const row = (r: IncomingRow, actions: PvpActions) => html`<tr>
  ${noteMarker(r.opponent, r.note, actions)}${opponentCell(r, actions)}<td>${r.when}</td><td>${r.what}</td></tr>`;

const table = (vm: IncomingVm, window: RowWindow, actions: PvpActions) => html`<table class="pvp-table pvp-incoming">
    <colgroup><col class="c-note" /><col /><col class="c-when" /><col /></colgroup>
    <thead><tr><th></th><th>${t('pvp.attacker')}</th><th>${t('pvp.when')}</th><th>${t('pvp.kind')}</th></tr></thead>
    <tbody>${rowsShown(vm.rows, vm.from, vm.total, window).map((r) => row(r, actions))}</tbody>
  </table>`;

export const incomingView = (vm: IncomingVm, window: RowWindow, actions: PvpActions) =>
  listView(vm, window, actions, { none: 'pvp.noIncoming', noMatch: 'pvp.noIncomingMatch' }, table(vm, window, actions));
