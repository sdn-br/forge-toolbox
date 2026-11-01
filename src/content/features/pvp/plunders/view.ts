import { html } from 'lit-html';
import { t } from '../../../core/texts';
import { listView, noteMarker, opponentLink, type PvpActions } from '../rows';
import type { PlunderRow, PlundersVm } from './view-model';

const row = (r: PlunderRow, actions: PvpActions) => html`<tr>
  ${noteMarker(r.opponent, r.note, actions)}${opponentLink(r, actions)}
  <td>${r.when}</td><td>${r.building}</td>
  <td>${r.loot}${r.doubleLoot ? html` <b>${t('plunder.doubleLoot')}</b>` : ''}</td></tr>`;

const table = (vm: PlundersVm, actions: PvpActions) => html`<table>
    <tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.building')}</th><th>${t('pvp.loot')}</th></tr>
    ${vm.rows.map((r) => row(r, actions))}
  </table>`;

export const plundersView = (vm: PlundersVm, actions: PvpActions) =>
  listView(vm, actions, { none: 'pvp.noPlunders', noMatch: 'pvp.noPlunderMatch' }, table(vm, actions));
