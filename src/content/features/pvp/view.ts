import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { filterToggle } from '../../ui/buttons';
import { headerIcons } from '../../ui/icons';
import { searchField } from '../../ui/inputs';
import { sideDrawer } from '../../ui/side-drawer';
import { tabBar } from '../../ui/tabs';
import type { RowWindow } from '../../ui/windowed-rows';
import { battlePanel } from './battles/panel';
import { battlesView } from './battles/view';
import type { BattlePanelVm } from './battles/view-model';
import { incomingView } from './incoming/view';
import type { PvpActions, PvpFilter, PvpTab } from './rows';
import { type PvpVm, TABS } from './tabs';

const list = (vm: PvpVm, window: RowWindow, actions: PvpActions) =>
  vm.tab === 'battles' ? battlesView(vm, window, actions) : incomingView(vm, window, actions);

/** one row: the name field, the star and the warning filter, on the battles the sack filter */
const filterBar = (f: PvpFilter, tab: PvpTab, actions: PvpActions) => html`<p class="pvp-filter">
    ${searchField(f.name, t('pvp.search'), (name) => actions.filter({ name }))}
    ${filterToggle(
      'pvp-plunder-filter',
      f.onlyPlunder,
      t('pvp.filter.onlyPlunder'),
      headerIcons.plunderStarFilled,
      (onlyPlunder) => actions.filter({ onlyPlunder }),
    )}
    ${filterToggle(
      'pvp-no-attack-filter',
      f.onlyNoAttack,
      t('pvp.filter.onlyNoAttack'),
      headerIcons.noAttackOn,
      (onlyNoAttack) => actions.filter({ onlyNoAttack }),
    )}
    ${
      tab === 'battles'
        ? filterToggle(
            'pvp-loot-filter',
            f.withPlunder,
            t('pvp.filter.withPlunder'),
            headerIcons.lootFilled,
            (withPlunder) => actions.filter({ withPlunder }),
          )
        : ''
    }
  </p>`;

/** width of the docked side panel in pixels: the units of both sides stand side by side */
export const PANEL_WIDTH = 300;

/** the side panel, only on the battles; `selected` is the battle it shows */
export interface PanelState {
  open: boolean;
  selected?: BattlePanelVm;
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
