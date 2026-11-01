import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { searchField } from '../../ui/inputs';
import { tabBar } from '../../ui/tabs';
import { battlesView } from './battles/view';
import { incomingView } from './incoming/view';
import { plundersView } from './plunders/view';
import type { PvpActions, PvpTab } from './rows';
import { type PvpVm, TABS } from './tabs';

const tabs = (current: PvpTab | undefined, actions: PvpActions) =>
  tabBar(TABS, current ?? 'battles', (tab) => t(`pvp.tab.${tab}`), actions.tab);

const list = (vm: PvpVm, actions: PvpActions) => {
  switch (vm.tab) {
    case 'battles':
      return battlesView(vm, actions);
    case 'plunders':
      return plundersView(vm, actions);
    case 'incoming':
      return incomingView(vm, actions);
  }
};

/** `note` is the note card of the picked player */
export function pvpView(vm: PvpVm | undefined, actions: PvpActions, note?: TemplateResult): TemplateResult {
  const filter = html`<p>
    ${searchField(vm?.search ?? '', t('pvp.search'), actions.search)}
    ${
      vm?.picked
        ? html`<button class="action icon-only" data-tip=${t('pvp.clearFilter')} aria-label=${t('pvp.clearFilter')}
          @click=${() => actions.clearPick()}>${t('pvp.onlyPlayer', { name: vm.picked })}${headerIcons.close}</button>`
        : ''
    }</p>`;
  // the search field stays in one outer template: swapping templates would replace it and take its focus mid-typing
  return html`${tabs(vm?.tab, actions)}${filter}${note ?? ''}${vm ? list(vm, actions) : ''}`;
}
