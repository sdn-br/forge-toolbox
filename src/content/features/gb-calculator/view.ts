import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import { keepKeys } from '../../ui/inputs';
import { type CostCell, FACTOR_PRESETS, type GbCalculatorVm, type GbHeader, type PlaceRow } from './view-model';

export interface GbCalculatorActions {
  /** a preset or a typed factor in percent */
  setFactor(value: number): void;
  /** the Arc bonus as the factor */
  useArc(): void;
}

const percent = (n: number) => `${formatNumber(n)} %`;

function header(h: GbHeader) {
  const fp =
    h.availableFp === undefined
      ? t('gbCalc.availableUnknown')
      : t('gbCalc.availableFp', { fp: formatNumber(h.availableFp) });
  return html`<p><b>${t('gbCalc.heading', { name: h.name, level: h.level, next: h.next })}</b>
    <br />${t('gbCalc.owner', { name: h.owner })}
    <br /><span class="muted">${fp} · ${t('gbCalc.arc', { arc: formatNumber(h.arcBonus) })}</span></p>`;
}

function factorBar(vm: Extract<GbCalculatorVm, { kind: 'current' }>, actions: GbCalculatorActions) {
  const { factor } = vm;
  const typed = (e: Event) => {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) actions.setFactor(value);
  };
  return html`<div class="gb-factor">
    <span>${t('gbCalc.factor')}</span>
    ${FACTOR_PRESETS.map(
      (
        n,
      ) => html`<button class=${!factor.arc && factor.value === n ? 'active' : ''} @click=${() => actions.setFactor(n)}>
        ${percent(n)}</button>`,
    )}
    <button class=${factor.arc ? 'active' : ''} @click=${() => actions.useArc()}>
      ${t('gbCalc.factorArc')} (${percent(vm.header.arcBonus)})</button>
    <input type="number" min="-100" max="200" step="1" title=${t('gbCalc.factorInput')} aria-label=${t('gbCalc.factorInput')}
      class=${!factor.arc && !FACTOR_PRESETS.includes(factor.value as never) ? 'active' : ''}
      .value=${String(factor.value)} @keydown=${keepKeys} @change=${typed} />
  </div>`;
}

function costCell(c: CostCell) {
  const extra = c.extra !== c.cost && c.extra > 0 ? html` <span class="muted">(+${formatNumber(c.extra)})</span>` : '';
  return html`<td class=${c.short ? 'num short' : 'num'} title=${c.short ? t('gbCalc.short') : ''}>${formatNumber(c.cost)}${extra}</td>`;
}

const placeTitle = (p: PlaceRow) =>
  [
    p.holder ? t('gbCalc.holder', { name: p.holder.name, fp: formatNumber(p.holder.fp) }) : t('gbCalc.empty'),
    t(`gbCalc.status.${p.status}`),
  ].join(', ');

const placeRow = (p: PlaceRow) =>
  html`<tr class=${`gb-${p.status}`} title=${placeTitle(p)}>
    <td>${p.rank}</td>
    ${costCell(p.safe)}
    ${costCell(p.demand)}
    <td class="num">${formatNumber(p.gross)}</td>
    <td class="num">${formatNumber(p.profit)}</td>
    <td class="num">${p.rate === undefined ? '' : percent(p.rate)}</td>
    <td class="num">${formatNumber(p.blueprints)}</td>
    <td class="num">${formatNumber(p.medals)}</td>
  </tr>`;

function placesTable(places: PlaceRow[]) {
  return html`<table class="gb-table">
    <tr>
      <th>${t('gbCalc.place')}</th>
      <th class="num" title=${t('gbCalc.safeHint')}>${t('gbCalc.safe')}</th>
      <th class="num" title=${t('gbCalc.demandHint')}>${t('gbCalc.demand')}</th>
      <th class="num" title=${t('gbCalc.grossHint')}>${t('gbCalc.gross')}</th>
      <th class="num">${t('gbCalc.profit')}</th>
      <th class="num" title=${t('gbCalc.rateHint')}>${t('gbCalc.rate')}</th>
      <th class="num">${t('gbCalc.blueprints')}</th>
      <th class="num">${t('gbCalc.medals')}</th>
    </tr>
    ${places.map(placeRow)}
  </table>`;
}

function overlayText(vm: Extract<GbCalculatorVm, { kind: 'current' }>): string | undefined {
  if (vm.leveled !== undefined) return t('gbCalc.leveled', { level: vm.leveled });
  if (vm.blocked === 'maxLevel') return t('gbCalc.maxLevel');
  if (vm.blocked === 'unconnected') return t('gbCalc.unconnected');
  return undefined;
}

export function gbCalculatorView(vm: GbCalculatorVm, actions: GbCalculatorActions): TemplateResult {
  switch (vm.kind) {
    case 'none':
      return html`<p class="muted">${t('gbCalc.none')}</p>`;
    case 'noEntity':
      return html`<p>${t('gbCalc.owner', { name: vm.owner })}</p><p class="warn">${t('gbCalc.noEntity')}</p>`;
    case 'past':
      return html`${header(vm.header)}
        <p class="warn">${t('gbCalc.pastLevel', { from: vm.level - 1, to: vm.level })}</p>
        <table class="gb-table">
          <tr><th>${t('gbCalc.place')}</th><th>${t('gbCalc.player')}</th><th class="num">${t('gbCalc.fp')}</th></tr>
          ${vm.rows.map(
            (r) =>
              html`<tr><td>${r.rank ?? ''}</td><td>${r.name}</td><td class="num">${formatNumber(r.fp ?? 0)}</td></tr>`,
          )}
        </table>`;
    case 'current': {
      const overlay = overlayText(vm);
      return html`${header(vm.header)}
        ${factorBar(vm, actions)}
        <div class="gb-places">
          ${placesTable(vm.places)}
          ${overlay ? html`<div class="gb-overlay"><p>${overlay}</p></div>` : ''}
        </div>
        <p>${t('gbCalc.missing', { fp: formatNumber(vm.missing) })}</p>`;
    }
  }
}
