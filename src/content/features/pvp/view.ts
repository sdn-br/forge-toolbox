import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { toggleGroup } from '../../ui/buttons';
import { headerIcons } from '../../ui/icons';
import { searchField } from '../../ui/inputs';
import { sideDrawer } from '../../ui/side-drawer';
import { tabBar } from '../../ui/tabs';
import type { RowWindow } from '../../ui/windowed-rows';
import { battlePanel } from './battles/panel';
import { battlesView } from './battles/view';
import type { BattlePanelVm } from './battles/view-model';
import { incomingView } from './incoming/view';
import { LOOT_TOGGLES, MARK_TOGGLES, type PvpActions, type PvpFilter, type PvpTab } from './rows';
import { type PvpVm, TABS } from './tabs';

const list = (vm: PvpVm, window: RowWindow, actions: PvpActions) =>
  vm.tab === 'battles' ? battlesView(vm, window, actions) : incomingView(vm, window, actions);

const MARK_ICONS = {
  plunder: headerIcons.plunderStarFilled,
  noAttack: headerIcons.noAttackOn,
  none: headerIcons.noPvpMark,
};
const LOOT_ICONS = { with: headerIcons.lootFilled, without: headerIcons.noLoot };

/** one row: the name field, the mark toggles, on the battles the sack toggles; each toggle shows its rows while on */
const filterBar = (f: PvpFilter, tab: PvpTab, actions: PvpActions) => html`<p class="pvp-filter">
    ${searchField(f.name, t('pvp.search'), (name) => actions.filter({ name }))}
    ${toggleGroup(
      'pvp-mark-filter',
      MARK_TOGGLES,
      f.marks,
      (key) => t(`pvp.filter.marks.${key}`),
      (key) => MARK_ICONS[key],
      (marks) => actions.filter({ marks }),
    )}
    ${
      tab === 'battles'
        ? toggleGroup(
            'pvp-loot-filter',
            LOOT_TOGGLES,
            f.loot,
            (key) => t(`pvp.filter.loot.${key}`),
            (key) => LOOT_ICONS[key],
            (loot) => actions.filter({ loot }),
          )
        : ''
    }
  </p>`;

/** width of the docked side panel in pixels: one column per side */
export const PANEL_WIDTH = 300;

/** the side panel, only on the battles and only while a battle is selected; `selected` is the battle it shows */
export interface PanelState {
  open: boolean;
  selected: BattlePanelVm;
}

const panel = (state: PanelState, actions: PvpActions) =>
  sideDrawer({
    cls: 'pvp-drawer',
    open: state.open,
    label: t('pvp.panel'),
    tip: t(state.open ? 'pvp.panelClose' : 'pvp.panelOpen'),
    toggle: actions.togglePanel,
    panel: battlePanel(state.selected),
    width: PANEL_WIDTH,
  });

/** what the box draws; `shown` is the loaded view model with the window of rows it draws, `note` the note card of the
 * player the name field names */
export function pvpView(
  tab: PvpTab,
  filter: PvpFilter,
  shown: { vm: PvpVm; window: RowWindow } | undefined,
  actions: PvpActions,
  note?: TemplateResult,
  side?: PanelState,
): TemplateResult {
  // the name field stays in one outer template: swapping templates would replace it and take its focus mid-typing.
  // Tabs, filters, note card and totals stay, the rows that fit are drawn and the two buttons scroll them
  return html`<div class="pvp-layout"><div class="pvp-pane">${tabBar(TABS, tab, (key) => t(`pvp.tab.${key}`), actions.tab)}${filterBar(
    filter,
    tab,
    actions,
  )}${note ?? ''}${shown ? list(shown.vm, shown.window, actions) : ''}</div>${tab === 'battles' && side ? panel(side, actions) : ''}</div>`;
}
