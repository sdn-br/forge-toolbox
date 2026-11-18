import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { toggleGroup } from '../../ui/buttons';
import { headerIcons } from '../../ui/icons';
import { searchField } from '../../ui/inputs';
import { guildTag } from '../../ui/links';
import { sideDrawer } from '../../ui/side-drawer';
import { tabBar } from '../../ui/tabs';
import type { RowWindow } from '../../ui/windowed-rows';
import type { ArenaHistoryVm } from './arena/history';
import { historyPanel } from './arena/history-view';
import { arenaView } from './arena/view';
import type { DefensePanelVm } from './arena/view-model';
import { battlePanel } from './battles/panel';
import { battlesView } from './battles/view';
import type { BattlePanelVm } from './battles/view-model';
import { incomingView } from './incoming/view';
import {
  ARENA_KINDS,
  ARENA_MARK_TOGGLES,
  type ArenaKind,
  type ArenaMarkFilter,
  LOOT_TOGGLES,
  MARK_TOGGLES,
  type PvpActions,
  type PvpFilter,
  type PvpTab,
} from './rows';
import { type PvpVm, TABS } from './tabs';

const list = (vm: PvpVm, window: RowWindow, actions: PvpActions) => {
  if (vm.tab === 'battles') return battlesView(vm, window, actions);
  return vm.tab === 'arena' ? arenaView(vm, window, actions) : incomingView(vm, window, actions);
};

const MARK_ICONS = {
  plunder: headerIcons.plunderStarFilled,
  noAttack: headerIcons.noAttackOn,
  none: headerIcons.noPvpMark,
};
const LOOT_ICONS = { with: headerIcons.lootFilled, without: headerIcons.noLoot };

/** the arena's mark toggles: the warning triangle, and the same in hollow pieces for "ohne Markierung" */
const arenaMarkIcon = (key: keyof ArenaMarkFilter) =>
  key === 'noAttack' ? headerIcons.noAttackOn : headerIcons.noArenaMark;

/** one row: the name field, the mark toggles (the arena has its own), on the battles the sack toggles; each toggle
 * shows its rows while on */
const filterBar = (f: PvpFilter, tab: PvpTab, actions: PvpActions) => html`<p class="pvp-filter">
    ${searchField(f.name, t('pvp.search'), (name) => actions.filter({ name }))}
    ${
      tab === 'arena'
        ? toggleGroup(
            'pvp-arena-mark-filter',
            ARENA_MARK_TOGGLES,
            f.arenaMarks,
            (key) => t(`pvp.filter.arenaMarks.${key}`),
            arenaMarkIcon,
            (arenaMarks) => actions.filter({ arenaMarks }),
          )
        : toggleGroup(
            'pvp-mark-filter',
            MARK_TOGGLES,
            f.marks,
            (key) => t(`pvp.filter.marks.${key}`),
            (key) => MARK_ICONS[key],
            (marks) => actions.filter({ marks }),
          )
    }
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

/** the side panel, only on the battles and the arena and only while a battle is selected; `selected` is the battle it
 * shows */
export type PanelState = { open: boolean } & ({ selected: BattlePanelVm } | { defense: DefensePanelVm });

/** a defense line: the attacker, the time and the points; the game sends no battle of it */
const defensePanel = (vm: DefensePanelVm) =>
  html`<h2>${vm.name}${vm.guild ? html` ${guildTag(vm.guild)}` : ''}</h2><p><span class="muted">${vm.when}</span> <span class=${`pvp-points ${vm.gain}`}>${vm.points}</span></p><p class="muted">${t('pvp.arena.defenseNote')}</p>`;

const panel = (state: PanelState, actions: PvpActions) =>
  sideDrawer({
    cls: 'pvp-drawer',
    open: state.open,
    label: t('pvp.panel'),
    tip: t(state.open ? 'pvp.panelClose' : 'pvp.panelOpen'),
    toggle: actions.togglePanel,
    panel: 'defense' in state ? defensePanel(state.defense) : battlePanel(state.selected),
    width: PANEL_WIDTH,
  });

/** the second drawer, on the arena only: the history of the points, on the side the battle panel does not take; its
 * content is empty until the first read is there */
export interface HistoryState {
  open: boolean;
  vm?: ArenaHistoryVm;
}

const historyDrawer = (state: HistoryState, actions: PvpActions) =>
  sideDrawer({
    cls: 'pvp-history-drawer',
    secondary: true,
    open: state.open,
    label: t('pvp.arena.history.panel'),
    tip: t(state.open ? 'pvp.arena.history.panelClose' : 'pvp.arena.history.show'),
    toggle: actions.toggleHistory,
    panel: state.vm ? historyPanel(state.vm) : html``,
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
  arenaKind: ArenaKind = 'attack',
  history?: HistoryState,
): TemplateResult {
  // the name field stays in one outer template: swapping templates would replace it and take its focus mid-typing.
  // Tabs, filters, note card and totals stay, the rows that fit are drawn and the two buttons scroll them
  return html`<div class="pvp-layout"><div class="pvp-pane">${tabBar(TABS, tab, (key) => t(`pvp.tab.${key}`), actions.tab)}${
    tab === 'arena'
      ? tabBar(ARENA_KINDS, arenaKind, (key) => t(`pvp.arena.tab.${key}`), actions.arenaKind, undefined, 'sub')
      : ''
  }${filterBar(
    filter,
    tab,
    actions,
  )}${note ?? ''}${shown ? list(shown.vm, shown.window, actions) : ''}</div>${(tab === 'battles' || tab === 'arena') && side ? panel(side, actions) : ''}${tab === 'arena' && history ? historyDrawer(history, actions) : ''}</div>`;
}
