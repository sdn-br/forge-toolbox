import { html } from 'lit-html';
import { t } from '../../../core/texts';
import { formatArmy } from '../../../ui/army-format';
import { battleDetailsView } from '../../../ui/battle-details';
import { headerIcons } from '../../../ui/icons';
import { detailsRef, listView, noteMarker, opponentCell, type PvpActions } from '../rows';
import { type PvpWindow, rowsShown } from '../window';
import type { BattlesVm, PlunderVm, PvpRow } from './view-model';

/** a click on the row shows its details, a click on its link or buttons does what they do */
const expandOnClick = (battleId: number, actions: PvpActions) => (e: Event) => {
  if (!(e.target as Element).closest('a, button')) actions.expand(battleId);
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

/** "Plünderung: Strohdachhaus · 1.220 Münzen Double Loot", "Plünderung abgewehrt: –" */
const plunderView = (p: PlunderVm) =>
  html`<p class="pvp-plunder">${t(`pvp.plunder.${p.outcome}`, { building: p.building })}${p.loot ? ` · ${p.loot}` : ''}${
    p.doubleLoot ? html` <b>${t('plunder.doubleLoot')}</b>` : ''
  }</p>`;

/** units and result of a fought battle, of an inferred one only that it was not recorded; then the plunder */
const details = (r: PvpRow, actions: PvpActions) =>
  html`<tr class="details" ${detailsRef(r.battleId, actions)}><td colspan="8">${
    r.details ? battleDetailsView(r.details) : html`<p class="muted">${t('pvp.inferredTip')}</p>`
  }${r.plunder ? plunderView(r.plunder) : ''}</td></tr>`;

const rowTip = (r: PvpRow) => t(r.inferred ? 'pvp.plunderDetails' : r.loot ? 'pvp.detailsPlunder' : 'pvp.details');

const row = (r: PvpRow, actions: PvpActions) =>
  html`<tr class=${r.expanded ? 'battle-row expanded' : 'battle-row'} data-tip=${rowTip(r)}
    @click=${expandOnClick(r.battleId, actions)}>${cells(r, actions)}</tr>${r.expanded ? details(r, actions) : ''}`;

const table = (vm: BattlesVm, window: PvpWindow, actions: PvpActions) => {
  const loot = t('pvp.lootCol');
  // the values stand without their unit, the heads explain them
  const hint = t('pvp.armyHint');
  return html`<table class="pvp-table pvp-battles">
    <colgroup><col class="c-note" /><col /><col class="c-when" /><col class="c-result" /><col class="c-loot" />
      <col class="c-battle" /><col class="c-army" /><col class="c-army" /></colgroup>
    <thead><tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.result')}</th>
      <th class="pvp-loot" data-tip=${loot} aria-label=${loot}>${headerIcons.loot}</th><th>${t('pvp.battle')}</th>
      <th class="num" data-tip=${hint}>${t('pvp.attacker')}</th><th class="num" data-tip=${hint}>${t('pvp.defender')}</th></tr></thead>
    <tbody>${rowsShown(vm.rows, vm.from, window).map((r) => row(r, actions))}</tbody>
  </table>`;
};

export const battlesView = (vm: BattlesVm, window: PvpWindow, actions: PvpActions) =>
  listView(vm, window, actions, { none: 'pvp.none', noMatch: 'pvp.noMatch' }, table(vm, window, actions));
