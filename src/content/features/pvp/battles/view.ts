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

const cells = (
  r: PvpRow,
  actions: PvpActions,
) => html`${noteMarker(r.opponent, r.note, actions)}${opponentLink(r, actions)}
  <td>${r.when}</td><td>${r.result}</td><td>${r.battle}</td>
  <td class="num">${r.attacker ? formatArmy(r.attacker) : ''}</td><td class="num">${r.defender ? formatArmy(r.defender) : ''}</td>`;

/** an inferred battle has nothing to show beyond its row */
const row = (r: PvpRow, actions: PvpActions) =>
  r.inferred
    ? html`<tr data-tip=${t('pvp.inferredTip')}>${cells(r, actions)}</tr>`
    : html`<tr class=${r.details ? 'battle-row expanded' : 'battle-row'}
    data-tip=${t('pvp.details')} @click=${expandOnClick(r.battleId, actions)}>${cells(r, actions)}</tr>
  ${r.details ? html`<tr class="details"><td colspan="7">${battleDetailsView(r.details)}</td></tr>` : ''}`;

const table = (vm: BattlesVm, actions: PvpActions) => html`<table>
    <tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.result')}</th><th>${t('pvp.battle')}</th>
      <th class="num">${t('pvp.attacker')}</th><th class="num">${t('pvp.defender')}</th></tr>
    ${vm.rows.map((r) => row(r, actions))}
  </table>
  <p class="muted">${t('pvp.armyHint')}</p>`;

export const battlesView = (vm: BattlesVm, actions: PvpActions) =>
  listView(vm, actions, { none: 'pvp.none', noMatch: 'pvp.noMatch' }, table(vm, actions));
