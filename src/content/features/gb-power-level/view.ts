import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import { type FactorActions, factorBar } from '../../ui/factor-bar';
import { type FactorLevelActions, factorLevel, placeFactorField } from '../../ui/factor-state';
import { headerIcons } from '../../ui/icons';
import { keepKeys } from '../../ui/inputs';
import { MAX_ROWS, type PayCell, type PowerLevelVm, type PowerRow } from './view-model';

export interface PowerLevelActions extends FactorActions, FactorLevelActions {
  /** the factor of one place, in percent */
  setPlaceFactor(rank: number, value: number): void;
  /** the first level of the table; undefined takes the open level */
  setFrom(level: number | undefined): void;
  /** the last level; undefined takes 10 levels after the first */
  setTo(level: number | undefined): void;
  /** copies a text; `id` names what was copied, so the box can say so for a moment */
  copy(text: string, id: string): void;
}

type TableVm = Extract<PowerLevelVm, { kind: 'table' }>;

/** column widths in em: Stufe, P1 to P5, then Eigenanteil, Doppelernte (only with its column), Netto, Summe, copy */
const widths = (harvest: boolean) => [5.6, 4.6, 4.6, 4.6, 4.6, 4.6, 5.4, ...(harvest ? [5.2] : []), 5.2, 6, 2.2];

/** `copied` names what was copied a moment ago */
export function powerLevelView(vm: PowerLevelVm, actions: PowerLevelActions, copied?: string) {
  switch (vm.kind) {
    case 'none':
      return html`<p class="muted">${t('gbPower.none')}</p>`;
    case 'noEntity':
      return html`<p class="warn">${t('gbCalc.noEntity')}</p>`;
    case 'leveled':
      return html`<p class="gb-title">${vm.name}</p><p class="warn">${t('gbCalc.leveled', { level: vm.level })}</p>`;
    case 'noDefinition':
      return html`<p class="gb-title">${vm.name}</p><p class="muted">${t('gbPower.noDefinition')}</p>`;
  }
  return table(vm, actions, copied);
}

const number = (n: number) => formatNumber(n);

/** a level field: typed and left empty takes its default */
function levelField(label: string, hint: string, value: number, min: number, set: (level: number | undefined) => void) {
  const typed = (e: Event) => {
    const n = (e.target as HTMLInputElement).valueAsNumber;
    set(Number.isFinite(n) ? n : undefined);
  };
  return html`<span>${label}</span>
    <input class="span" type="number" min=${min} step="1" data-tip=${hint} aria-label=${hint} .value=${String(value)}
      @keydown=${keepKeys} @change=${typed} />`;
}

function table(vm: TableVm, actions: PowerLevelActions, copied?: string) {
  const cols = widths(vm.harvestColumn);
  return html`<p class="gb-title">${vm.name}</p>
    ${factorBar(vm.factorButtons, vm.factor, actions, factorLevel(vm.factorState, actions))}
    <div class="gb-levels">
      ${levelField(t('gbPower.from'), t('gbPower.fromHint'), vm.from, vm.current, actions.setFrom)}
      ${levelField(t('gbPower.to'), t('gbPower.toHint'), vm.to, vm.from + 1, actions.setTo)}
      <span class="muted">(${t('gbPower.max', { max: MAX_ROWS })})</span>
    </div>
    <table class="gb-table power-level" style=${`width:${cols.reduce((sum, w) => sum + w, 0)}em`}>
      <colgroup>${cols.map((w) => html`<col style=${`width:${w}em`} />`)}</colgroup>
      <tr>
        <th data-tip=${t('gbPower.levelHint')}>${t('gbPower.level')}</th>
        ${[1, 2, 3, 4, 5].map(
          (rank) => html`<th class="num" data-tip=${t('gbPower.placeHint', { rank })}>P${rank}</th>`,
        )}
        <th class="num" data-tip=${t('gbPower.ownShareHint')}>${t('gbPower.ownShare')}</th>
        ${vm.harvestColumn ? html`<th class="num" data-tip=${t('gbPower.harvestHint')}>${t('gbPower.harvest')}</th>` : ''}
        <th class="num" data-tip=${t('gbPower.netHint')}>${t('gbPower.net')}</th>
        <th class="num" data-tip=${t('gbPower.sumHint')}>${t('gbPower.sum')}</th>
        <th></th>
      </tr>
      <tr class="factors">
        <td data-tip=${t('gbOwn.placeFactorHint')}>${t('gbCalc.factor')}</td>
        ${vm.placeFactors.map(
          (p, i) =>
            html`<td class="num">${placeFactorField(p.factor, p.arc, (percent) => actions.setPlaceFactor(i + 1, percent))}</td>`,
        )}
        <td colspan=${cols.length - 6}></td>
      </tr>
      ${vm.rows.map((r) => row(r, vm.harvestColumn, actions, copied))}
    </table>
    ${vm.endsAt === undefined ? '' : html`<p class="muted">${t('gbPower.endsAt', { level: vm.endsAt })}</p>`}
    <p class="gb-me">${
      vm.harvestColumn
        ? t('gbPower.totals', {
            own: number(vm.totals.ownShare),
            harvest: number(vm.totals.harvest),
            net: number(vm.totals.net),
          })
        : t('gbPower.totalsOwnOnly', { own: number(vm.totals.ownShare) })
    }</p>
    ${vm.estimate ? html`<p class="muted">${t('gbCalc.estimate')}</p>` : ''}`;
}

/** a payment from a computed reward stands italic with „≈“, as in the Eigenanteil box */
function payCell(p: PayCell | undefined) {
  if (!p) return html`<td class="num">–</td>`;
  return p.estimate
    ? html`<td class="num estimate" data-tip=${t('gbCalc.estimate')}>≈ ${number(p.fp)}</td>`
    : html`<td class="num">${number(p.fp)}</td>`;
}

function harvestCell(r: PowerRow): TemplateResult {
  if (!r.harvest) return html`<td class="num">–</td>`;
  return r.harvest.estimate
    ? html`<td class="num estimate" data-tip=${t('gbPower.harvestEstimate')}>≈ ${number(r.harvest.fp)}</td>`
    : html`<td class="num">${number(r.harvest.fp)}</td>`;
}

function row(r: PowerRow, harvest: boolean, actions: PowerLevelActions, copied?: string) {
  const id = `level${r.level}`;
  const levelTip = [
    r.current && t('gbPower.currentTip', { fp: number(r.ownShare), paid: number(r.paid ?? 0) }),
    r.locked && t('gbPower.lockedTip'),
  ]
    .filter(Boolean)
    .join('\n');
  const classes = [r.current && 'current', r.locked && 'locked'].filter(Boolean).join(' ');
  return html`<tr class=${classes}>
    <td data-tip=${levelTip}>${r.level}→${r.next}</td>
    ${r.places.map(payCell)}
    <td class="num">${number(r.ownShare)}</td>
    ${harvest ? harvestCell(r) : ''}
    <td class="num">${number(r.net)}</td>
    <td class="num">${number(r.sum)}</td>
    <td><button class="icon" data-tip=${t('gbPower.copyHint')} aria-label=${t('gbOwn.copy')}
      @click=${() => actions.copy(r.copy, id)}>${copied === id ? headerIcons.check : headerIcons.copy}</button></td>
  </tr>`;
}
