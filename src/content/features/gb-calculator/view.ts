import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import type { LevelUpAndFirst } from '../../domain/gb-level-preview';
import { type FactorActions, factorBar } from '../../ui/factor-bar';
import { levelBar } from '../../ui/level-bar';
import { externalLink } from '../../ui/links';
import type {
  ActivityVm,
  CostCell,
  DemandCell,
  GbCalculatorVm,
  GbHeader,
  MeVm,
  PlaceRow,
  PreviewVm,
} from './view-model';

export interface GbCalculatorActions extends FactorActions {
  /** preview a later level; undefined goes back to the current construction */
  previewLevel(level: number | undefined): void;
}

const percent = (n: number) => `${formatNumber(n)} %`;

const activityLine = (a: ActivityVm) =>
  html`<br />${t('foestats.label')}:
    <span class=${a.idle ? 'gb-activity warn' : 'gb-activity muted'} data-tip=${a.title}>${a.text}${
      a.week ? ` · ${a.week}` : ''
    }</span>${a.loading ? html` <span class="spinner" data-tip=${t('foestats.loading')}></span>` : ''}`;

const owner = (name: string, url: string) => html`${t('gbCalc.ownerLabel')}: ${externalLink(name, url)}`;

function header(h: GbHeader) {
  const fp =
    h.availableFp === undefined
      ? t('gbCalc.availableUnknown')
      : t('gbCalc.availableFp', { fp: formatNumber(h.availableFp) });
  const part = (n: number | undefined) => (n === undefined ? '?' : formatNumber(n));
  const split = t('gbCalc.fpSplit', { bar: part(h.fpBar), packages: part(h.fpPackages) });
  return html`<p><span class="gb-title">${t('gbCalc.heading', { name: h.name, level: h.level, next: h.next })}</span>
    <span class="muted">· ${t('gbCalc.unlocked', { max: h.maxLevel })}</span>
    <br />${owner(h.owner, h.ownerUrl)}${h.activity ? activityLine(h.activity) : ''}
    <br /><span class="muted"><span class="gb-fp" data-tip=${split}>${fp}</span> ·
      ${t('gbCalc.arc', { arc: formatNumber(h.arcBonus) })}</span></p>`;
}

/** stands where a place has no cost, below the own one */
const NONE = html`<td class="num">–</td>`;

function costCell(c: CostCell | undefined) {
  if (!c) return NONE;
  const extra = c.extra !== c.cost && c.extra > 0 ? html` <span class="muted">(+${formatNumber(c.extra)})</span>` : '';
  return html`<td class=${c.short ? 'num short' : 'num'} data-tip=${c.short ? t('gbCalc.short') : ''}>${formatNumber(c.cost)}${extra}</td>`;
}

/** the demand with its notes: more than the level needs (red), below the safe cost (muted), the profit at it */
function demandCell(d: DemandCell | undefined) {
  if (!d) return NONE;
  const extra = d.extra !== d.cost && d.extra > 0 ? html` <span class="muted">(+${formatNumber(d.extra)})</span>` : '';
  const classes = ['num', d.short && 'short', d.overRest !== undefined && 'over-rest', d.belowSafe && 'below-safe'];
  const title = [
    t('gbCalc.demandProfit', { fp: formatNumber(d.profit) }),
    d.overRest !== undefined && t('gbCalc.demandOverRest', { fp: formatNumber(d.overRest) }),
    d.belowSafe && t('gbCalc.demandBelowSafe'),
    d.short && t('gbCalc.short'),
  ].filter(Boolean);
  return html`<td class=${classes.filter(Boolean).join(' ')} data-tip=${title.join('\n')}>${formatNumber(d.cost)}${extra}</td>`;
}

const maybe = (n: number | undefined) => (n === undefined ? NONE : html`<td class="num">${formatNumber(n)}</td>`);

/** the own deposit: safe, or the places still to make safe with what is missing for each */
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNumber(n)}`;

/** what leveling now and taking place 1 of the next level costs and pays, the total bold and green */
function levelUpLine(l: LevelUpAndFirst) {
  const paid = t('gbCalc.levelUp', {
    level: l.nextLevel,
    fill: formatNumber(l.fill),
    first: formatNumber(l.firstCost),
  });
  const second = `${l.firstGain < 0 ? '−' : '+'} ${formatNumber(Math.abs(l.firstGain))}`;
  return html`<span class="gb-levelup">${paid} → ${signed(l.fillGain)} ${second} = <b class="gain">${signed(
    l.total,
  )}</b></span>`;
}

function meLine(me: MeVm) {
  const levelUp = me.levelUp ? html`<br />${levelUpLine(me.levelUp)}` : '';
  if (me.secured)
    return html`<p class="gb-me safe">${t('gbCalc.me', { fp: formatNumber(me.fp), rank: me.rank ?? '?' })} · ${t(
      'gbCalc.meSecured',
    )}${levelUp}</p>`;
  const where =
    me.fp > 0
      ? `${t('gbCalc.me', { fp: formatNumber(me.fp), rank: me.rank ?? '?' })}${
          me.secured === false ? ` · ${t('gbCalc.meUnsafe')}` : ''
        }`
      : t('gbCalc.meNone');
  // with nothing paid in yet the total is what to pay, else what to add
  const target = (x: MeVm['targets'][number]) => {
    const text = t('gbCalc.meTarget', {
      rank: x.rank,
      fp: me.fp > 0 ? `+${formatNumber(x.extra)}` : formatNumber(x.cost),
    });
    return x.best ? html`<b>${text}</b>` : text;
  };
  const targets = me.targets.length
    ? me.targets.map((x, i) => html`${i ? ' · ' : ''}${target(x)}`)
    : t(me.noneWorthwhile ? 'gbCalc.meNoneWorthwhile' : 'gbCalc.meNoTarget');
  return html`<p class="gb-me">${where}<br /><span class="muted">${targets}</span>${levelUp}</p>`;
}

const placeTitle = (p: PlaceRow) =>
  [
    p.holder ? t('gbCalc.holder', { name: p.holder.name, fp: formatNumber(p.holder.fp) }) : t('gbCalc.empty'),
    t(`gbCalc.status.${p.status}`),
  ].join(', ');

/** the safe cost; a check mark where the holder is safe, the own place too (the row colour tells which) */
function safeCell(p: PlaceRow) {
  if (p.secured && !p.safe) return html`<td class="num" data-tip=${t('gbCalc.securedHint')}>✓</td>`;
  return costCell(p.safe);
}

/** the own row while not safe: what the own deposit pays now (muted), then the rate at the safe cost */
function rateCell(p: PlaceRow) {
  const deposit =
    p.depositRate === undefined
      ? undefined
      : html`<span class=${p.safe ? 'muted' : ''} data-tip=${t('gbCalc.depositRateHint')}>${percent(p.depositRate)}</span>`;
  if (!p.safe) return deposit ? html`<td class="num">${deposit}</td>` : NONE;
  const rate = p.rate === undefined ? '' : percent(p.rate);
  return html`<td class="num">${deposit ? html`${deposit} → ` : ''}${rate}</td>`;
}

/** Platz, Investiert, Sichern, FP, Gewinn, Fördern, Kurs; blueprints and medals stay in the view model, not shown */
const placeRow = (p: PlaceRow) =>
  html`<tr class=${`gb-${p.status}`} data-tip=${placeTitle(p)}>
    <td>${p.rank}</td>
    ${maybe(p.holder?.fp)}
    ${safeCell(p)}
    <td class=${p.estimate ? 'num estimate' : 'num'} data-tip=${p.estimate ? t('gbCalc.estimate') : ''}>${
      p.estimate ? '≈ ' : ''
    }${formatNumber(p.gross)}</td>
    ${p.profit === undefined ? NONE : html`<td class="num">${formatNumber(p.profit)}</td>`}
    ${demandCell(p.demand)}
    ${rateCell(p)}
  </tr>`;

function placesTable(places: PlaceRow[]) {
  return html`<table class="gb-table">
    <tr>
      <th>${t('gbCalc.place')}</th>
      <th class="num" data-tip=${t('gbCalc.investedHint')}>${t('gbCalc.invested')}</th>
      <th class="num" data-tip=${t('gbCalc.safeHint')}>${t('gbCalc.safe')}</th>
      <th class="num" data-tip=${t('gbCalc.grossHint')}>${t('gbCalc.gross')}</th>
      <th class="num">${t('gbCalc.profit')}</th>
      <th class="num" data-tip=${t('gbCalc.demandHint')}>${t('gbCalc.demand')}</th>
      <th class="num" data-tip=${t('gbCalc.rateHint')}>${t('gbCalc.rate')}</th>
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

function previewPart(p: PreviewVm) {
  const note = p.unknown === 'definition' ? t('gbCalc.previewNoDefinition') : t('gbCalc.previewNoReward');
  return html`<p class="warn">${t('gbCalc.previewHeading', { level: p.level, next: p.next })}${
    p.locked ? html` <span class="muted">· ${t('gbCalc.previewLocked')}</span>` : ''
  }</p>
    ${p.unknown ? html`<p class="muted">${note}</p>` : placesTable(p.places)}
    ${p.required === undefined ? '' : html`<p>${t('gbCalc.previewCost', { fp: formatNumber(p.required) })}</p>`}
    ${p.estimate ? html`<p class="muted">${t('gbCalc.estimate')}</p>` : ''}`;
}

export function gbCalculatorView(vm: GbCalculatorVm, actions: GbCalculatorActions): TemplateResult {
  switch (vm.kind) {
    case 'none':
      return html`<p class="muted">${t('gbCalc.none')}</p>`;
    case 'noEntity':
      return html`<p>${owner(vm.owner, vm.ownerUrl)}</p><p class="warn">${t('gbCalc.noEntity')}</p>`;
    case 'past':
      return html`${header(vm.header)}
        ${levelBar(vm.header.levels, (level) => actions.previewLevel(level))}
        <p class="warn">${t('gbCalc.pastLevel', { from: vm.level - 1, to: vm.level })}</p>
        <table class="gb-table">
          <tr><th>${t('gbCalc.place')}</th><th>${t('gbCalc.player')}</th><th class="num">${t('gbCalc.fp')}</th></tr>
          ${vm.rows.map(
            (r) =>
              html`<tr><td>${r.rank ?? ''}</td><td>${r.url ? externalLink(r.name, r.url) : r.name}</td>
                <td class="num">${formatNumber(r.fp ?? 0)}</td></tr>`,
          )}
        </table>`;
    case 'preview':
      return html`${header(vm.header)}
        ${levelBar(vm.header.levels, (level) => actions.previewLevel(level))}
        ${factorBar(vm.factorButtons, vm.effectiveFactor, actions)}
        ${vm.levelUp ? html`<p class="gb-me">${levelUpLine(vm.levelUp)}</p>` : ''}
        ${previewPart(vm.preview)}`;
    case 'current': {
      const overlay = overlayText(vm);
      return html`${header(vm.header)}
        ${levelBar(vm.header.levels, (level) => actions.previewLevel(level))}
        ${factorBar(vm.factorButtons, vm.effectiveFactor, actions)}
        ${vm.me ? meLine(vm.me) : ''}
        <div class="gb-places">
          ${placesTable(vm.places)}
          ${overlay ? html`<div class="gb-overlay"><p>${overlay}</p></div>` : ''}
        </div>
        <p>${t('gbCalc.missing', { fp: formatNumber(vm.missing) })}</p>`;
    }
  }
}
