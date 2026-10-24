import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import type { OwnPlace } from '../../domain/gb-own-share';
import { type FactorActions, factorBar } from '../../ui/factor-bar';
import { type FactorLevelActions, factorLevel, placeFactorField } from '../../ui/factor-state';
import { headerIcons } from '../../ui/icons';
import { keepKeys } from '../../ui/inputs';
import { type LevelChoice, levelBar } from '../../ui/level-bar';
import type { CopyVm, OwnPreviewVm, OwnRow, OwnShareVm } from './view-model';

export interface OwnShareActions extends FactorActions, FactorLevelActions {
  setExt(rank: number, fp: number): void;
  /** the factor of one place, in percent */
  setPlaceFactor(rank: number, value: number): void;
  setSecure(on: boolean): void;
  setTrust(on: boolean): void;
  setCopyBuilding(name: string): void;
  /** copies a text; `id` names what was copied, so the box can say so for a moment */
  copy(text: string, id: string): void;
  /** opens the Powerleveln box */
  openPowerLevel(): void;
  /** preview a later level; undefined goes back to the open level */
  previewLevel(level: number | undefined): void;
}

type Cell = (n: number, id: string) => TemplateResult;

/** `copied` names what was copied a moment ago */
export function ownShareView(vm: OwnShareVm, actions: OwnShareActions, copied?: string) {
  switch (vm.kind) {
    case 'none':
      return html`<p class="muted">${t('gbOwn.none')}</p>`;
    case 'noEntity':
      return html`<p class="warn">${t('gbCalc.noEntity')}</p>`;
    case 'unconnected':
      return html`<p><b>${vm.name}</b></p><p class="muted">${t('gbCalc.unconnected')}</p>`;
    case 'leveled':
      return html`<p><b>${vm.name}</b></p><p class="warn">${t('gbCalc.leveled', { level: vm.level })}</p>`;
    case 'previewUnknown': {
      const note = vm.preview.unknown === 'definition' ? t('gbCalc.previewNoDefinition') : t('gbCalc.previewNoReward');
      return html`${head(vm.name, vm.levels, actions)}${previewHeading(vm.preview)}
        <p class="muted">${note}</p>${previewCost(vm.preview)}`;
    }
  }
  const cell: Cell = (n, id) => copyCell(n, id, actions, copied);
  return html`${head(vm.name, vm.levels, actions)}
    ${vm.preview ? previewHeading(vm.preview) : ''}
    ${factorBar(vm.factorButtons, vm.factor, actions, factorLevel(vm.factorState, actions))}
    <table class="gb-table own-share" style=${`width:${COLUMNS.reduce((sum, c) => sum + c.width, 0)}em`}>
      <colgroup>${COLUMNS.map((c) => html`<col style=${`width:${c.width}em`} />`)}</colgroup>
      <tr>
        <th data-tip=${t('gbOwn.order')}>${t('gbOwn.orderShort')}</th>
        <th class="icon-cell" data-tip=${t('gbCalc.player')} aria-label=${t('gbCalc.player')}>${headerIcons.person}</th>
        <th data-tip=${t('gbOwn.stateHint')}>${t('gbOwn.state')}</th>
        <th class="num" data-tip=${t('gbOwn.payHint')}>${t('gbOwn.pay')}</th>
        <th class="num" data-tip=${t('gbOwn.doneHint')}>${t('gbOwn.done')}</th>
        <th class="num" data-tip=${t('gbOwn.diffHint')}>${t('gbOwn.diff')}</th>
        <th class="num" data-tip=${t('gbOwn.extHint')}>${t('gbOwn.ext')}</th>
        <th class="num" data-tip=${t('gbOwn.placeFactorHint')}>${t('gbCalc.factor')}</th>
      </tr>
      ${vm.rows.map((r, i) =>
        r.kind === 'own'
          ? ownRow(r, cell, i)
          : r.kind === 'pushed'
            ? pushedRow(r)
            : placeRow(r, cell, actions, !vm.preview),
      )}
    </table>
    <div class="gb-factor">
      <label><input type="checkbox" .checked=${vm.secureExisting}
        @change=${(e: Event) => actions.setSecure((e.target as HTMLInputElement).checked)} />
        <span data-tip=${t('gbOwn.secureHint')}>${t('gbOwn.secure')}</span></label>
      <label><input type="checkbox" .checked=${vm.trust}
        @change=${(e: Event) => actions.setTrust((e.target as HTMLInputElement).checked)} />
        <span data-tip=${t('gbOwn.trustHint')}>${t('gbOwn.trust')}</span></label>
    </div>
    <div class="power-open"><button class="icon-text" data-tip=${t('gbPower.openHint')}
      @click=${() => actions.openPowerLevel()}>${headerIcons.levels}${t('gbPower.title')}</button></div>
    <p class="gb-me">${t('gbOwn.total', { fp: formatNumber(vm.ownShare) })}
      <span class="muted">· ${t('gbOwn.paid', { fp: formatNumber(vm.myDeposit) })}</span>
      · <b>${t('gbOwn.open', { fp: formatNumber(Math.max(0, vm.open)) })}</b></p>
    ${vm.addedLive > 0 ? html`<p class="warn">${t('gbOwn.addedLive', { fp: formatNumber(vm.addedLive) })}</p>` : ''}
    ${vm.preview ? previewCost(vm.preview) : ''}
    ${vm.preview?.estimate ? html`<p class="muted">${t('gbCalc.estimate')}</p>` : ''}
    ${copyPanel(vm.copy, actions, copied)}`;
}

/** the name with the open level, then the level field */
const head = (name: string, l: LevelChoice, actions: OwnShareActions) =>
  html`<p><b>${t('gbCalc.heading', { name, level: l.current, next: l.current + 1 })}</b></p>
    ${levelBar(l, (level) => actions.previewLevel(level))}`;

/** the previewed level, as in the LG-Rechner */
const previewHeading = (p: OwnPreviewVm) =>
  html`<p class="warn">${t('gbCalc.previewHeading', { level: p.level, next: p.next })}${
    p.locked ? html` <span class="muted">· ${t('gbCalc.previewLocked')}</span>` : ''
  }</p>`;

const previewCost = (p: OwnPreviewVm) =>
  p.required === undefined ? '' : html`<p>${t('gbCalc.previewCost', { fp: formatNumber(p.required) })}</p>`;

const NONE = html`<td class="num">–</td>`;

/**
 * The columns with their fixed widths in em, so the box keeps its size whatever the cells hold; a column that has
 * nothing to show stays and is left empty. Numbers fit six digits with separators; Zahlen also holds `(=total)`,
 * which shrinks to an ellipsis before the column grows.
 */
const COLUMNS = [
  { width: 3 }, // order: P1, #6-7
  { width: 2.2 }, // player icon, later the avatar
  { width: 4.4 }, // state: icon and the danger number
  { width: 9 }, // Zahlen
  { width: 5.2 }, // Erledigt
  { width: 5.4 }, // Differenz
  { width: 5.4 }, // Ext
  { width: 4.8 }, // Faktor
];
/** columns a row label spans: order, player and state */
const LABEL_SPAN = 3;

const fp = (n: number, cls = 'num') => html`<td class=${cls}>${formatNumber(n)}</td>`;

/** a number to pay: a click copies it plain for the deposit field of the game */
function copyCell(n: number, id: string, actions: OwnShareActions, copied?: string) {
  return html`<button class="copy-fp" data-tip=${t('gbOwn.copyNumber')}
    @click=${() => actions.copy(String(n), id)}>${copied === id ? t('gbOwn.copiedShort') : formatNumber(n)}</button>`;
}

/** the own Forge points: what to pay before the next place with the total so far, in the first row also what is paid */
function ownRow(r: Extract<OwnRow, { kind: 'own' }>, cell: Cell, i: number) {
  const pay =
    r.fp > 0
      ? html`<td class="num own-fp">${cell(r.fp, `own${i}`)} <span class="muted">(=${formatNumber(r.total)})</span></td>`
      : NONE;
  return html`<tr class="own-row"><td colspan=${LABEL_SPAN}>${t('gbOwn.ownFp')}</td>${pay}${r.paid > 0 ? fp(r.paid) : NONE}<td></td><td></td><td></td></tr>`;
}

function pushedRow(r: Extract<OwnRow, { kind: 'pushed' }>) {
  const ranks = r.from === r.to ? `#${r.from}` : `#${r.from}-${r.to}`;
  return html`<tr class="gb-unavailable"><td colspan=${LABEL_SPAN} data-tip=${t('gbOwn.pushedHint')}>${ranks}</td>${NONE}${fp(r.fp)}<td></td><td></td><td></td></tr>`;
}

/** an icon with its words in the tooltip and as its name; the avatar of the player takes this place later */
const marker = (icon: TemplateResult, label: string, cls = '') =>
  html`<span class=${`marker ${cls}`.trim()} role="img" data-tip=${label} aria-label=${label}>${icon}</span>`;

function placeRow(r: Extract<OwnRow, { kind: 'place' }>, cell: Cell, actions: OwnShareActions, withExt: boolean) {
  const { place: p, ext } = r;
  const holder = p.holder?.ext
    ? marker(headerIcons.clock, t('gbOwn.extHolder'), 'muted')
    : p.holder
      ? marker(headerIcons.person, p.holder.name)
      : '';
  // a payment from a computed reward stands italic with „≈“, as the reward in the LG-Rechner
  const pay =
    p.holder || p.full || p.unoffered
      ? NONE
      : r.estimate
        ? html`<td class="num estimate" data-tip=${t('gbCalc.estimate')}>≈ ${cell(p.amount, `place${p.rank}`)}</td>`
        : html`<td class="num">${cell(p.amount, `place${p.rank}`)}</td>`;
  const done = p.holder ? fp(p.holder.fp, p.holder.ext ? 'num muted' : 'num') : NONE;
  const typed = (e: Event) => {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    actions.setExt(p.rank, Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
  };
  // the Ext column stays in the preview, empty, so the widths do not change
  return html`<tr class=${p.full ? 'gb-unavailable' : ''}>
    <td>P${p.rank}</td><td class="icon-cell">${holder}</td><td>${placeState(p)}</td>${pay}${done}${diffCell(p)}
    ${
      withExt
        ? html`<td class="num"><input class="ext" type="number" min="0" step="1" aria-label=${t('gbOwn.extHint')}
      .value=${ext ? String(ext) : ''} @keydown=${keepKeys} @change=${typed} /></td>`
        : html`<td></td>`
    }
    ${factorCell(r, actions)}
  </tr>`;
}

/** the factor of the place; a place without a Forge point reward has none, it changes nothing there */
const factorCell = (r: Extract<OwnRow, { kind: 'place' }>, actions: OwnShareActions) =>
  r.factor === undefined
    ? html`<td></td>`
    : html`<td class="num">${placeFactorField(r.factor, r.arc === true, (percent) => actions.setPlaceFactor(r.place.rank, percent))}</td>`;

/** a holder who keeps the place: his deposit against the payment at the factor, + paid more, − paid less */
function diffCell(p: OwnPlace) {
  if (!p.holder) return NONE;
  const diff = p.holder.fp - p.ask;
  const tip = t('gbOwn.diffTip', { paid: formatNumber(p.holder.fp), ask: formatNumber(p.ask) });
  const cls = diff > 0 ? 'num gain' : diff < 0 ? 'num short' : 'num';
  return html`<td class=${cls} data-tip=${tip}>${diff > 0 ? '+' : ''}${formatNumber(diff)}</td>`;
}

/** what applies to a free place, as an icon: no reward, levels the building, or danger with its number */
function placeState(p: OwnPlace) {
  if (p.unoffered) return marker(headerIcons.noReward, t('gbOwn.unofferedHint'), 'muted');
  if (p.levels) return marker(headerIcons.arrowUp, t('gbOwn.levelsHint'), 'levels');
  if (p.danger !== undefined)
    return marker(
      html`${headerIcons.warning}<span class="state-fp">${formatNumber(p.danger)}</span>`,
      t('gbOwn.dangerTip', { fp: formatNumber(p.danger) }),
      'danger',
    );
  return '';
}

/** the copy text, editable before copying, with the name of the building it uses; what goes in is in the settings */
function copyPanel(c: CopyVm, actions: OwnShareActions, copied?: string) {
  const copyTyped = (e: Event) => {
    const field = (e.target as Element).closest('.copy-line')?.querySelector('.copy-text') as HTMLInputElement | null;
    actions.copy(field?.value ?? c.text, 'text');
  };
  return html`<div class="copy-line">
    <input class="copy-building" type="text" data-tip=${t('gbOwn.copyBuildingHint')} aria-label=${t('gbOwn.copyBuildingHint')}
      .value=${c.building} @keydown=${keepKeys}
      @change=${(e: Event) => actions.setCopyBuilding((e.target as HTMLInputElement).value)} />
    <input class="copy-text" type="text" aria-label=${t('gbOwn.copyPreview')} .value=${c.text} @keydown=${keepKeys} />
    <button class="icon" data-tip=${t('gbOwn.copy')} aria-label=${t('gbOwn.copy')}
      @click=${copyTyped}>${copied === 'text' ? headerIcons.check : headerIcons.copy}</button>
  </div>`;
}
