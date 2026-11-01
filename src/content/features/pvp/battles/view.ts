import { html } from 'lit-html';
import { t } from '../../../core/texts';
import { formatArmy } from '../../../ui/army-format';
import { battleDetailsView } from '../../../ui/battle-details';
import { listView, noteMarker, opponentLink, type PvpActions } from '../rows';
import type { BattlesVm, PvpRow } from './view-model';

/** a click on the row shows its details, a click on its link or note marker does what they do */
const expandOnClick = (battleId: number, actions: PvpActions) => (e: Event) => {
  if (!(e.target as Element).closest('a, button')) actions.expand(battleId);
};

const row = (r: PvpRow, actions: PvpActions) => html`<tr class=${r.details ? 'battle-row expanded' : 'battle-row'}
    data-tip=${t('pvp.details')} @click=${expandOnClick(r.battleId, actions)}>
  ${noteMarker(r.opponent, r.note, actions)}${opponentLink(r, actions)}
  <td>${r.when}</td><td>${r.result}</td><td>${r.battle}</td>
  <td class="num">${formatArmy(r.attacker)}</td><td class="num">${formatArmy(r.defender)}</td></tr>
  ${r.details ? html`<tr class="details"><td colspan="7">${battleDetailsView(r.details)}</td></tr>` : ''}`;

const table = (vm: BattlesVm, actions: PvpActions) => html`<table>
    <tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.result')}</th><th>${t('pvp.battle')}</th>
      <th class="num">${t('pvp.attacker')}</th><th class="num">${t('pvp.defender')}</th></tr>
    ${vm.rows.map((r) => row(r, actions))}
  </table>
  <p class="muted">${t('pvp.armyHint')}</p>`;

export const battlesView = (vm: BattlesVm, actions: PvpActions) =>
  listView(vm, actions, { none: 'pvp.none', noMatch: 'pvp.noMatch' }, table(vm, actions));
