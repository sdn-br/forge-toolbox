import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import type { GreatBuildingTier } from '../../model/catalog';
import { iconButton } from '../../ui/buttons';
import { emptyCell, estimateCell } from '../../ui/estimate-cell';
import { type FactorActions, factorBar } from '../../ui/factor-bar';
import { headerIcons } from '../../ui/icons';
import { keepKeys } from '../../ui/inputs';
import { rowsIn, windowedRows } from '../../ui/windowed-rows';
import { type FactorLevelActions, factorLevel, placeFactorField } from '../gb-own-share/factor-state';
import { MAX_ROWS, type PayCell, type PowerLevelVm, type PowerRow, VISIBLE_ROWS } from './view-model';

export interface PowerLevelActions extends FactorActions, FactorLevelActions {
  /** the factor of one place, in percent */
  /** for levels of `tier` */
  setPlaceFactor(rank: number, value: number, tier: GreatBuildingTier): void;
  /** the first level of the table; undefined takes the open level */
  setFrom(level: number | undefined): void;
  /** the last level; undefined takes 10 levels after the first */
  setTo(level: number | undefined): void;
  /** copies a text; `id` names what was copied, so the box can say so for a moment */
  copy(text: string, id: string): void;
  /** moves the level rows by rows, down for positive; the owner keeps the offset inside the table */
  scroll(rows: number): void;
}

type TableVm = Extract<PowerLevelVm, { kind: 'table' }>;

/**
 * column widths in em: Stufe, the places (P1 to P5, or to P7 with a gold level), then Eigenanteil, Doppelernte (only
 * with its column), Netto, Summe, copy
 */
const widths = (places: number, harvest: boolean) => [
  5.6,
  ...Array.from({ length: places }, () => 4.6),
  5.4,
  ...(harvest ? [5.2] : []),
  5.2,
  6,
  2.2,
];

/** the width of the table in em, the box follows it */
export const tableEm = (places: number, harvest: boolean) => widths(places, harvest).reduce((sum, w) => sum + w, 0);

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

/** Head and factor row stay, the body shows the rows of the window; wheel and the two buttons move it by a row. Up to
 * `VISIBLE_ROWS` levels the table stands alone, without buttons. */
function levelRows(vm: TableVm, cols: number[], actions: PowerLevelActions, copied?: string) {
  const table = html`<table class="gb-table power-level" style=${`width:${tableEm(vm.places, vm.harvestColumn)}em`}>
      <colgroup>${cols.map((w) => html`<col style=${`width:${w}em`} />`)}</colgroup>
      <thead>
        <tr>
          <th data-tip=${t('gbPower.levelHint')}>${t('gbPower.level')}</th>
          ${Array.from(
            { length: vm.places },
            (_, i) => html`<th class="num" data-tip=${t('gbPower.placeHint', { rank: i + 1 })}>P${i + 1}</th>`,
          )}
          <th class="num" data-tip=${t('gbPower.ownShareHint')} aria-label=${t('gbPower.ownShare')}>${t('gbPower.ownShareShort')}</th>
          ${vm.harvestColumn ? html`<th class="num" data-tip=${t('gbPower.harvestHint')} aria-label=${t('gbPower.harvest')}>${headerIcons.doubleHarvest}</th>` : ''}
          <th class="num" data-tip=${t('gbPower.netHint')}>${t('gbPower.net')}</th>
          <th class="num" data-tip=${t('gbPower.sumHint')} aria-label=${t('gbPower.sum')}>${t('gbPower.sumShort')}</th>
          <th></th>
        </tr>
        <tr class="factors">
          <td data-tip=${t('gbOwn.placeFactorHint')}>${t('gbCalc.factor')}</td>
          ${vm.placeFactors.map(
            (p, i) =>
              html`<td class="num">${placeFactorField(p.factor, p.arc, (percent) => actions.setPlaceFactor(i + 1, percent, vm.tier))}</td>`,
          )}
          <td colspan=${cols.length - 1 - vm.places}></td>
        </tr>
      </thead>
      <tbody>${rowsIn(vm.rows, vm.window).map((r) => row(r, vm.harvestColumn, actions, copied))}</tbody>
    </table>`;
  if (vm.rows.length <= VISIBLE_ROWS) return table;
  return windowedRows({ cls: 'power-win', table, window: vm.window, scroll: actions.scroll });
}

function table(vm: TableVm, actions: PowerLevelActions, copied?: string) {
  const cols = widths(vm.places, vm.harvestColumn);
  return html`<p class="gb-title">${vm.name}</p>
    ${factorBar(vm.factorButtons, vm.factor, actions, vm.tier, factorLevel(vm.factorState, actions))}
    <div class="gb-levels">
      ${levelField(t('gbPower.from'), t('gbPower.fromHint'), vm.from, vm.current, actions.setFrom)}
      ${levelField(t('gbPower.to'), t('gbPower.toHint'), vm.to, vm.from + 1, actions.setTo)}
      <span class="muted">(${t('gbPower.max', { max: MAX_ROWS })})</span>
    </div>
    ${levelRows(vm, cols, actions, copied)}
    ${vm.endsAt === undefined ? '' : html`<p class="muted">${t('gbPower.endsAt', { level: vm.endsAt })}</p>`}
    <p class="gb-me">${
      vm.harvestColumn
        ? t('gbPower.totals', {
            own: number(vm.totals.ownShare),
            harvest: number(vm.totals.harvest),
            net: number(vm.totals.net),
          })
        : t('gbPower.totalsOwnOnly', { own: number(vm.totals.ownShare) })
    }</p>`;
}

function payCell(p: PayCell | undefined) {
  if (!p) return emptyCell;
  return html`<td class="num">${number(p.fp)}</td>`;
}

function harvestCell(r: PowerRow): TemplateResult {
  if (!r.harvest) return emptyCell;
  return estimateCell(number(r.harvest.fp), r.harvest.estimate, [], t('gbPower.harvestEstimate'));
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
    <td>${iconButton(
      t('gbOwn.copy'),
      () => actions.copy(r.copy, id),
      copied === id ? headerIcons.check : headerIcons.copy,
      'icon',
      t('gbPower.copyHint'),
    )}</td>
  </tr>`;
}
