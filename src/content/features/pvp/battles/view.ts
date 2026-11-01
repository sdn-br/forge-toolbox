import { html } from 'lit-html';
import { t } from '../../../core/texts';
import { formatArmy } from '../../../ui/army-format';
import { headerIcons } from '../../../ui/icons';
import type { RowWindow } from '../../../ui/windowed-rows';
import { listView, noteMarker, opponentCell, type PvpActions, rowsShown } from '../rows';
import type { BattlesVm, PvpRow } from './view-model';

/** a click on the row selects the battle for the side panel, a click on its link or buttons does what they do */
const selectOnClick = (battleId: number, actions: PvpActions) => (e: Event) => {
  if (!(e.target as Element).closest('a, button')) actions.select(battleId);
};

/** the sack: filled for a plunder, outline for a repelled one, nothing without a plunder */
const lootCell = (r: PvpRow) => {
  if (!r.loot) return html`<td class="pvp-loot"></td>`;
  const word = t(`pvp.lootMark.${r.loot}`);
  return html`<td class="pvp-loot"><span role="img" data-tip=${word} aria-label=${word}>${
    r.loot === 'plundered' ? headerIcons.lootFilled : headerIcons.loot
  }</span></td>`;
};

const cells = (
  r: PvpRow,
  actions: PvpActions,
) => html`${noteMarker(r.opponent, r.note, actions)}${opponentCell(r, actions)}
  <td>${r.when}</td><td>${r.result}</td>${lootCell(r)}<td>${r.battle}</td>
  <td class="num">${r.attacker ? formatArmy(r.attacker) : ''}</td><td class="num">${r.defender ? formatArmy(r.defender) : ''}</td>`;

const row = (r: PvpRow, actions: PvpActions) =>
  html`<tr class=${r.selected ? 'battle-row selected' : 'battle-row'} data-tip=${t(r.selected ? 'pvp.unselect' : 'pvp.select')}
    @click=${selectOnClick(r.battleId, actions)}>${cells(r, actions)}</tr>`;

const table = (vm: BattlesVm, window: RowWindow, actions: PvpActions) => {
  const loot = t('pvp.lootCol');
  // the values stand without their unit, the heads explain them
  const hint = t('pvp.armyHint');
  return html`<table class="pvp-table pvp-battles">
    <colgroup><col class="c-note" /><col /><col class="c-when" /><col class="c-result" /><col class="c-loot" />
      <col class="c-battle" /><col class="c-army" /><col class="c-army" /></colgroup>
    <thead><tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.result')}</th>
      <th class="pvp-loot" data-tip=${loot} aria-label=${loot}>${headerIcons.loot}</th><th>${t('pvp.battle')}</th>
      <th class="num" data-tip=${hint}>${t('pvp.attacker')}</th><th class="num" data-tip=${hint}>${t('pvp.defender')}</th></tr></thead>
    <tbody>${rowsShown(vm.rows, vm.from, vm.total, window).map((r) => row(r, actions))}</tbody>
  </table>`;
};

export const battlesView = (vm: BattlesVm, window: RowWindow, actions: PvpActions) =>
  listView(vm, window, actions, { none: 'pvp.none', noMatch: 'pvp.noMatch' }, table(vm, window, actions));
