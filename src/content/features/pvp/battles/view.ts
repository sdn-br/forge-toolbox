import { html, nothing } from 'lit-html';
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

/** the result as an icon in its colour, the word in tooltip and label */
const resultCell = (r: PvpRow) =>
  html`<td class=${`pvp-result ${r.outcome}`}><span role="img" data-tip=${r.result} aria-label=${r.result}>${headerIcons[r.outcome]}</span></td>`;

/** the sack: filled for a plunder, outline for a repelled one, nothing without a plunder */
const lootCell = (r: PvpRow) => {
  if (!r.loot) return html`<td class="pvp-loot"></td>`;
  const word = t(`pvp.lootMark.${r.loot}`);
  return html`<td class="pvp-loot"><span role="img" data-tip=${word} aria-label=${word}>${
    r.loot === 'plundered' ? headerIcons.lootFilled : headerIcons.loot
  }</span></td>`;
};

/** the measured armies of a fought battle, as the tooltip of its kind; an inferred battle has none */
const armyTip = (r: PvpRow) =>
  r.attacker && r.defender
    ? [
        t('pvp.armyHint'),
        `${t('pvp.attacker')}: ${formatArmy(r.attacker)}`,
        `${t('pvp.defender')}: ${formatArmy(r.defender)}`,
      ].join('\n')
    : undefined;

const cells = (
  r: PvpRow,
  actions: PvpActions,
) => html`${noteMarker(r.opponent, r.note, actions)}${opponentCell(r, actions)}
  <td>${r.when}</td>${resultCell(r)}${lootCell(r)}<td data-tip=${r.inferred ? t('pvp.inferredTip') : (armyTip(r) ?? nothing)}>${r.battle}</td>`;

const row = (r: PvpRow, actions: PvpActions) =>
  html`<tr class=${r.selected ? 'battle-row selected' : 'battle-row'} data-tip=${t(r.selected ? 'pvp.unselect' : 'pvp.select')}
    @click=${selectOnClick(r.battleId, actions)}>${cells(r, actions)}</tr>`;

const table = (vm: BattlesVm, window: RowWindow, actions: PvpActions) => {
  const loot = t('pvp.lootCol');
  const result = t('pvp.result');
  return html`<table class="pvp-table pvp-battles">
    <colgroup><col class="c-note" /><col /><col class="c-when" /><col class="c-result" /><col class="c-loot" />
      <col class="c-battle" /></colgroup>
    <thead><tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th class="pvp-result" data-tip=${result} aria-label=${result}>${headerIcons.won}</th>
      <th class="pvp-loot" data-tip=${loot} aria-label=${loot}>${headerIcons.loot}</th><th>${t('pvp.battle')}</th></tr></thead>
    <tbody>${rowsShown(vm.rows, vm.from, vm.total, window).map((r) => row(r, actions))}</tbody>
  </table>`;
};

export const battlesView = (vm: BattlesVm, window: RowWindow, actions: PvpActions) =>
  listView(vm, window, actions, { none: 'pvp.none', noMatch: 'pvp.noMatch' }, table(vm, window, actions));
