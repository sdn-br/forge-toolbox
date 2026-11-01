import { html } from 'lit-html';
import { t } from '../../../core/texts';
import { listView, noteMarker, opponentLink, type PvpActions } from '../rows';
import type { IncomingRow, IncomingVm } from './view-model';

const row = (r: IncomingRow, actions: PvpActions) => html`<tr>
  ${noteMarker(r.attacker, r.note, actions)}${opponentLink({ ...r, opponent: r.attacker }, actions)}
  <td>${r.when}</td><td>${r.what}</td></tr>`;

const table = (vm: IncomingVm, actions: PvpActions) => html`<table>
    <tr><th></th><th>${t('pvp.attacker')}</th><th>${t('pvp.when')}</th><th>${t('pvp.kind')}</th></tr>
    ${vm.rows.map((r) => row(r, actions))}
  </table>`;

export const incomingView = (vm: IncomingVm, actions: PvpActions) =>
  listView(vm, actions, { none: 'pvp.noIncoming', noMatch: 'pvp.noIncomingMatch' }, table(vm, actions));
