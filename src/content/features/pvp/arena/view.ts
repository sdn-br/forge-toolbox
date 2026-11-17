import { html } from 'lit-html';
import { t } from '../../../core/texts';
import { headerIcons } from '../../../ui/icons';
import { arenaNoAttackButton } from '../../../ui/pvp-marks';
import type { RowWindow } from '../../../ui/windowed-rows';
import { selectOnClick } from '../battles/view';
import { type ArenaKind, listView, noteMarker, opponentCell, type PvpActions, rowsShown } from '../rows';
import type { OfferRow } from './offers';
import type { ArenaRow, ArenaVm } from './view-model';

/** an attack's result as the icon of the battles in its colour, the word in tooltip and label */
const resultCell = (r: ArenaRow) =>
  html`<td class=${`pvp-result ${r.outcome}`}><span role="img" data-tip=${r.result} aria-label=${r.result}>${r.outcome && headerIcons[r.outcome]}</span></td>`;

/** the arena's own mark instead of the two PvP marks, only for a player the store knows */
const arenaMark = (r: Pick<ArenaRow, 'opponent' | 'arenaNoAttack'>, actions: PvpActions) =>
  r.arenaNoAttack === undefined
    ? html``
    : arenaNoAttackButton(r.arenaNoAttack, () => actions.arenaNoAttackPlayer(r.opponent, !r.arenaNoAttack));

/** an attack has a result column, a defense none */
const cells = (r: ArenaRow, actions: PvpActions, kind: ArenaKind) =>
  html`${noteMarker(r.opponent, r.note, actions)}${opponentCell(r, actions, arenaMark(r, actions))}<td>${r.when}</td>${kind === 'attack' ? resultCell(r) : ''}<td class=${`pvp-points ${r.gain}`}>${r.points}</td>`;

/** an attack with a stored battle selects it for the side panel, a defense selects its line, any other row is plain */
const row = (r: ArenaRow, actions: PvpActions, kind: ArenaKind) => {
  if (kind === 'defense')
    return html`<tr class=${r.selected ? 'battle-row selected' : 'battle-row'} data-tip=${t(r.selected ? 'pvp.unselect' : 'pvp.arena.defenseSelect')}
    @click=${selectDefenseOnClick(r, actions)}>${cells(r, actions, kind)}</tr>`;
  return r.battleId === undefined
    ? html`<tr>${cells(r, actions, kind)}</tr>`
    : html`<tr class=${r.selected ? 'battle-row selected' : 'battle-row'} data-tip=${t(r.selected ? 'pvp.unselect' : 'pvp.arena.select')}
    @click=${selectOnClick(r.battleId, actions)}>${cells(r, actions, kind)}</tr>`;
};

const selectDefenseOnClick = (r: ArenaRow, actions: Pick<PvpActions, 'selectDefense'>) => (e: Event) => {
  const target = e.target as Element;
  if ((e.currentTarget as Element).contains(target) && !target.closest('a, button'))
    actions.selectDefense(r.opponent, r.at);
};

/** an opponent on offer: the name cell as in the list, then the numbers; a row of a player marked as not to attack warns */
const offerRow = (r: OfferRow, actions: PvpActions) =>
  html`<tr class=${r.warn ? 'pvp-offer warn' : 'pvp-offer'}>${opponentCell(r, actions, arenaMark(r, actions))}<td data-tip=${r.era ? t('pvp.arena.offer.era', { era: r.era }) : ''}>${r.difficultyWord}</td><td class="pvp-points good">${r.reward}</td><td>${r.attackBoost}</td><td>${r.defenseBoost}</td><td class="pvp-record" data-tip=${r.recordTip}>${r.record}</td></tr>`;

/** the block "Gegner jetzt": the three opponents the arena offers, whatever the filters say */
const offers = (rows: OfferRow[], actions: PvpActions) => {
  const head = (text: 'attack' | 'defense' | 'reward') =>
    html`<th data-tip=${t(`pvp.arena.offer.${text}Tip`)}>${t(`pvp.arena.offer.${text}`)}</th>`;
  return html`<h3 class="pvp-offers-title">${t('pvp.arena.offer.title')}</h3><table class="pvp-table pvp-offers">
    <colgroup><col /><col class="c-offer-difficulty" /><col class="c-offer-num" /><col class="c-offer-num" /><col class="c-offer-num" /><col class="c-offer-record" /></colgroup>
    <thead><tr><th>${t('pvp.opponent')}</th><th>${t('pvp.arena.offer.difficulty')}</th>${head('reward')}${head('attack')}${head('defense')}<th data-tip=${t('pvp.arena.offer.recordHead')}>${t('pvp.arena.offer.record')}</th></tr></thead>
    <tbody>${rows.map((r) => offerRow(r, actions))}</tbody>
  </table>`;
};

const table = (vm: ArenaVm, window: RowWindow, actions: PvpActions) => {
  const result = t('pvp.result');
  const attack = vm.kind === 'attack';
  return html`<table class=${attack ? 'pvp-table pvp-arena' : 'pvp-table pvp-arena pvp-defenses'}>
    <colgroup><col class="c-note" /><col /><col class="c-when" />${attack ? html`<col class="c-arena-result" />` : ''}<col class="c-points" /></colgroup>
    <thead><tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th>${
      attack ? html`<th class="pvp-result" data-tip=${result} aria-label=${result}>${headerIcons.won}</th>` : ''
    }<th class="pvp-points">${t('pvp.arena.points')}</th></tr></thead>
    <tbody>${rowsShown(vm.rows, vm.from, vm.total, window).map((r) => row(r, actions, vm.kind))}</tbody>
  </table>`;
};

export const arenaView = (vm: ArenaVm, window: RowWindow, actions: PvpActions) =>
  html`${vm.offers ? offers(vm.offers, actions) : ''}${arenaList(vm, window, actions)}`;

const arenaList = (vm: ArenaVm, window: RowWindow, actions: PvpActions) =>
  listView(
    vm,
    window,
    actions,
    vm.kind === 'attack'
      ? { none: 'pvp.arena.none', noMatch: 'pvp.arena.noMatch' }
      : { none: 'pvp.arena.defenseNone', noMatch: 'pvp.arena.defenseNoMatch' },
    table(vm, window, actions),
  );
