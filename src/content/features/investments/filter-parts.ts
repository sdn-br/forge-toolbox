// The filter pieces both investment tabs draw: text fields, icon toggles, the star filter, the funnel beside an owner.
import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { keepKeys } from '../../ui/inputs';
import { REACH_TOGGLES, type Reach, type ReachFilter } from './filter-model';

export const REACH_ICONS: Partial<Record<Reach, TemplateResult>> = {
  neighbor: headerIcons.neighbor,
  friend: headerIcons.friend,
  guildMember: headerIcons.guild,
};

/** an icon per reason; out of reach and unknown stay words */
export const reachCell = (reach: Reach, reasons: Reach[]) =>
  reach === 'none' || reach === 'unknown'
    ? t(`investments.reach.${reach}`)
    : reasons.map((reason) => REACH_ICONS[reason]);

/** a filled star beside the name of a marked owner; only shown, the star to toggle sits where the player is seen */
export const ownerStar = (marked: boolean) => {
  if (!marked) return '';
  const word = t('investments.ownerMarked');
  return html`<span class="owner-star" role="img" data-tip=${word} aria-label=${word}>${headerIcons.starFilled}</span>`;
};

export const text = (value: string, label: string, set: (value: string) => void) =>
  html`<input type="search" placeholder=${label} aria-label=${label} .value=${value}
    @input=${(e: Event) => set((e.target as HTMLInputElement).value)}
    @keydown=${keepKeys} @keypress=${keepKeys} @keyup=${keepKeys} />`;

/** one icon toggle per key, in `cls`; the word in tooltip and `aria-label`, the state in `aria-pressed`, on is highlighted */
export const toggleGroup = <K extends string>(
  cls: string,
  keys: readonly K[],
  state: Record<K, boolean>,
  word: (key: K) => string,
  icon: (key: K) => TemplateResult,
  set: (state: Record<K, boolean>) => void,
) =>
  html`<span class=${cls}>${keys.map((key) => {
    const on = state[key];
    return html`<button class=${on ? 'on' : ''} aria-pressed=${on ? 'true' : 'false'} data-tip=${word(key)} aria-label=${word(key)}
    @click=${() => set({ ...state, [key]: !on })}>${icon(key)}</button>`;
  })}</span>`;

const REACH_FILTER_ICONS = { ...REACH_ICONS, none: headerIcons.notReachable } as Record<
  keyof ReachFilter,
  TemplateResult
>;

/** one toggle per reason, any switched on lets a row through */
export const reachFilter = (reach: ReachFilter, set: (reach: ReachFilter) => void) =>
  toggleGroup(
    'inv-reach-filter',
    REACH_TOGGLES,
    reach,
    (key) => t(key === 'none' ? 'investments.reachHint.none' : `investments.reach.${key}`),
    (key) => REACH_FILTER_ICONS[key],
    set,
  );

/** a toggle with the star: only marked buildings and buildings of marked owners */
export const markedFilter = (onlyMarked: boolean, set: (onlyMarked: boolean) => void) => {
  const word = t('investments.possible.onlyMarked');
  return html`<span class="inv-marked-filter"><button class=${onlyMarked ? 'on' : ''} aria-pressed=${onlyMarked ? 'true' : 'false'}
    data-tip=${word} aria-label=${word} @click=${() => set(!onlyMarked)}>${headerIcons.starFilled}</button></span>`;
};

/** shown on row hover or focus (styles), always and in the accent while the player field names this owner; then a click
 * empties the field */
export const pickButton = (name: string, picked: boolean, pick: (name: string) => void) => {
  const word = t(picked ? 'investments.possible.unpickPlayer' : 'investments.possible.pickPlayer');
  return html`<button class=${picked ? 'inv-pick on' : 'inv-pick'} aria-pressed=${picked ? 'true' : 'false'} data-tip=${word}
    aria-label=${word} @click=${() => pick(picked ? '' : name)}>${picked ? headerIcons.funnelFilled : headerIcons.funnel}</button>`;
};
