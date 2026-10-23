import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import type { OwnPlace } from '../../domain/gb-own-share';
import { FACTOR_STEP, type FactorActions, factorBar, percentOf } from '../../ui/factor-bar';
import { headerIcons } from '../../ui/icons';
import { keepKeys } from '../../ui/inputs';
import type { CopyVm, OwnRow, OwnShareVm } from './view-model';

export interface OwnShareActions extends FactorActions {
  setExt(rank: number, fp: number): void;
  /** the factor of one place, in percent */
  setPlaceFactor(rank: number, value: number): void;
  /** keeps the five factors for this building */
  saveFactors(): void;
  /** drops the building's saved factors and the change */
  resetFactors(): void;
  /** makes the five factors the standard */
  adoptFactors(): void;
  setSecure(on: boolean): void;
  setTrust(on: boolean): void;
  setCopyBuilding(name: string): void;
  /** copies a text; `id` names what was copied, so the box can say so for a moment */
  copy(text: string, id: string): void;
}

type Cell = (n: number, id: string) => TemplateResult;
type CurrentVm = Extract<OwnShareVm, { kind: 'current' }>;

/** `copied` names what was copied a moment ago */
export function ownShareView(vm: OwnShareVm, actions: OwnShareActions, copied?: string) {
  switch (vm.kind) {
    case 'none':
      return html`<p class="muted">${t('gbOwn.none')}</p>`;
    case 'noEntity':
      return html`<p class="warn">${t('gbCalc.noEntity')}</p>`;
    case 'blocked':
      return html`<p><b>${vm.name}</b></p><p class="muted">${t(vm.reason === 'maxLevel' ? 'gbOwn.maxLevel' : 'gbCalc.unconnected')}</p>`;
    case 'leveled':
      return html`<p><b>${vm.name}</b></p><p class="warn">${t('gbCalc.leveled', { level: vm.level })}</p>`;
  }
  const cell: Cell = (n, id) => copyCell(n, id, actions, copied);
  return html`<p><b>${t('gbCalc.heading', { name: vm.name, level: vm.level, next: vm.next })}</b></p>
    ${factorBar(vm.factorButtons, vm.factor, actions, factorLevel(vm.factorState, actions))}
    <table class="gb-table own-share">
      <tr>
        <th>${t('gbOwn.order')}</th>
        <th>${t('gbCalc.player')}</th>
        <th class="num" data-tip=${t('gbOwn.payHint')}>${t('gbOwn.pay')}</th>
        <th class="num" data-tip=${t('gbOwn.doneHint')}>${t('gbOwn.done')}</th>
        <th class="num" data-tip=${t('gbOwn.diffHint')}>${t('gbOwn.diff')}</th>
        <th class="num" data-tip=${t('gbOwn.extHint')}>${t('gbOwn.ext')}</th>
        <th class="num" data-tip=${t('gbOwn.placeFactorHint')}>${t('gbCalc.factor')}</th>
      </tr>
      ${vm.rows.map((r, i) =>
        r.kind === 'own' ? ownRow(r, cell, i) : r.kind === 'pushed' ? pushedRow(r) : placeRow(r, cell, actions),
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
    <p class="gb-me">${t('gbOwn.total', { fp: formatNumber(vm.ownShare) })}
      <span class="muted">· ${t('gbOwn.paid', { fp: formatNumber(vm.myDeposit) })}</span>
      · <b>${t('gbOwn.open', { fp: formatNumber(Math.max(0, vm.open)) })}</b></p>
    ${vm.addedLive > 0 ? html`<p class="warn">${t('gbOwn.addedLive', { fp: formatNumber(vm.addedLive) })}</p>` : ''}
    ${copyPanel(vm.copy, actions, copied)}`;
}

const NONE = html`<td class="num">–</td>`;

const STATUS = {
  standard: 'gbOwn.factorStandard',
  saved: 'gbOwn.factorSaved',
  changed: 'gbOwn.factorChanged',
} as const;

/** where the five factors come from, and the buttons that change it, each only when it does something */
function factorLevel(s: CurrentVm['factorState'], actions: OwnShareActions) {
  const button = (label: string, icon: TemplateResult, action: () => void) =>
    html`<button class="icon" data-tip=${label} aria-label=${label} @click=${action}>${icon}</button>`;
  return html`<span class="factor-status muted">${t(STATUS[s.status])}</span>
    ${s.canSave ? button(t('gbOwn.factorSave'), headerIcons.save, () => actions.saveFactors()) : ''}
    ${s.canReset ? button(t('gbOwn.factorReset'), headerIcons.reset, () => actions.resetFactors()) : ''}
    ${s.canAdopt ? button(t('gbOwn.factorAdopt'), headerIcons.star, () => actions.adoptFactors()) : ''}`;
}
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
  return html`<tr class="own-row"><td colspan="2">${t('gbOwn.ownFp')}</td>${pay}${r.paid > 0 ? fp(r.paid) : NONE}<td></td><td></td><td></td></tr>`;
}

function pushedRow(r: Extract<OwnRow, { kind: 'pushed' }>) {
  const ranks = r.from === r.to ? `#${r.from}` : `#${r.from}-${r.to}`;
  return html`<tr class="gb-unavailable"><td colspan="2" data-tip=${t('gbOwn.pushedHint')}>${ranks}</td>${NONE}${fp(r.fp)}<td></td><td></td><td></td></tr>`;
}

function placeRow(r: Extract<OwnRow, { kind: 'place' }>, cell: Cell, actions: OwnShareActions) {
  const { place: p, ext } = r;
  const holder = p.holder?.ext
    ? html`<span class="muted">${t('gbOwn.extHolder')}</span>`
    : p.holder
      ? html`${p.holder.name}`
      : html`<span class="muted">${t('gbCalc.empty')}</span>${placeWarning(p)}`;
  const pay = p.holder || p.full || p.unoffered ? NONE : html`<td class="num">${cell(p.amount, `place${p.rank}`)}</td>`;
  const done = p.holder ? fp(p.holder.fp, p.holder.ext ? 'num muted' : 'num') : NONE;
  const typed = (e: Event) => {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    actions.setExt(p.rank, Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
  };
  return html`<tr class=${p.full ? 'gb-unavailable' : ''}>
    <td>P${p.rank}</td><td>${holder}</td>${pay}${done}${diffCell(p)}
    <td class="num"><input class="ext" type="number" min="0" step="1" aria-label=${t('gbOwn.extHint')}
      .value=${ext ? String(ext) : ''} @keydown=${keepKeys} @change=${typed} /></td>
    ${factorCell(r, actions)}
  </tr>`;
}

/** the factor of the place, read as a factor; a place on the Arc bonus is marked, a typed number holds it */
function factorCell(r: Extract<OwnRow, { kind: 'place' }>, actions: OwnShareActions) {
  if (r.factor === undefined) return html`<td></td>`;
  const typed = (e: Event) => {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) actions.setPlaceFactor(r.place.rank, percentOf(value));
  };
  const tip = r.arc ? t('gbCalc.arcButton') : t('gbOwn.placeFactorHint');
  return html`<td class="num"><input class=${r.arc ? 'place-factor arc' : 'place-factor'} type="number" min="0" max="3"
    step=${FACTOR_STEP} data-tip=${tip} aria-label=${t('gbOwn.placeFactorHint')}
    .value=${String((100 + r.factor) / 100)} @keydown=${keepKeys} @change=${typed} /></td>`;
}

/** a holder who keeps the place: his deposit against the payment at the factor, + paid more, − paid less */
function diffCell(p: OwnPlace) {
  if (!p.holder) return NONE;
  const diff = p.holder.fp - p.ask;
  const tip = t('gbOwn.diffTip', { paid: formatNumber(p.holder.fp), ask: formatNumber(p.ask) });
  const cls = diff > 0 ? 'num gain' : diff < 0 ? 'num short' : 'num';
  return html`<td class=${cls} data-tip=${tip}>${diff > 0 ? '+' : ''}${formatNumber(diff)}</td>`;
}

function placeWarning(p: OwnPlace) {
  if (p.unoffered)
    return html` <span class="muted" data-tip=${t('gbOwn.unofferedHint')}>${t('gbOwn.unoffered')}</span>`;
  if (p.levels) return html` <span class="warn" data-tip=${t('gbOwn.levelsHint')}>${t('gbOwn.levels')}</span>`;
  if (p.danger !== undefined)
    return html` <span class="error" data-tip=${t('gbOwn.dangerHint')}>${t('gbOwn.danger', { fp: formatNumber(p.danger) })}</span>`;
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
    <button class="action" @click=${copyTyped}>${copied === 'text' ? t('gbOwn.copied') : t('gbOwn.copy')}</button>
  </div>`;
}
