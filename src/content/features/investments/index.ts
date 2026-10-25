import { foestatsPlayerUrl } from '../../../shared/foestats';
import type { PlayerId } from '../../../shared/ids';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { arcBonus } from '../../domain/gb-calculator';
import {
  type Investments,
  myInvestments,
  type PossibleInvestment,
  possibleInvestments,
} from '../../domain/investments';
import { calculatorFactor } from '../../ui/factor-bar';
import { icons } from '../../ui/icons';
import { nextSort } from '../../ui/sortable';
import { type PossibleActions, possibleView } from './possible-view';
import {
  DEFAULT_FILTER,
  DEFAULT_POSSIBLE_SORT,
  POSSIBLE_DESC_FIRST,
  type PossibleFilter,
  type PossibleSort,
  possibleViewModel,
} from './possible-view-model';
import { type InvestmentsActions, investmentsView } from './view';
import { INVESTMENT_DESC_FIRST, type InvestmentSort, type InvestmentsTab, investmentsViewModel } from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.investments;
const OPEN_WITH_LIST = 'investments.openWithList';
/** view choices: the tab and the filters of the possible investments */
const TAB = 'investments.tab';
const FILTER = 'investments.filter';

/** the saved filters, each part that is missing or broken at its default */
function savedFilter(saved: string | undefined): PossibleFilter {
  try {
    const f = JSON.parse(saved ?? '{}') as Partial<PossibleFilter>;
    return {
      player: typeof f.player === 'string' ? f.player : DEFAULT_FILTER.player,
      name: typeof f.name === 'string' ? f.name : DEFAULT_FILTER.name,
      onlyHits: typeof f.onlyHits === 'boolean' ? f.onlyHits : DEFAULT_FILTER.onlyHits,
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

export const investmentsFeature: Feature = {
  id: 'investments',
  setup(ctx) {
    ctx.settings.registerGroup('investments.title', ICON);
    ctx.settings.register({
      key: OPEN_WITH_LIST,
      group: 'investments.title',
      label: 'investments.openSetting',
      default: true,
    });

    let tab: InvestmentsTab = ctx.ui.pref(TAB) === 'possible' ? 'possible' : 'mine';
    let sort: InvestmentSort | undefined;
    let possibleSort: PossibleSort = DEFAULT_POSSIBLE_SORT;
    let filter = savedFilter(ctx.ui.pref(FILTER));
    let investments: Investments = { rows: [], totals: { circulating: 0, profitSafe: 0, profitTotal: 0 } };
    let possible: PossibleInvestment[] = [];
    /** owner names the town hall list and the lists of others give, for owners the player store does not know */
    const ownerNames = new Map<PlayerId, string>();
    let loads = 0;

    const showTab = (next: InvestmentsTab) => {
      tab = next;
      ctx.ui.savePref(TAB, next);
    };
    const actions: InvestmentsActions = {
      tab: (next) => {
        showTab(next);
        box.update();
      },
      sort: (column) => {
        sort = nextSort(sort, column, INVESTMENT_DESC_FIRST);
        box.update();
      },
    };
    const possibleActions: PossibleActions = {
      tab: actions.tab,
      sort: (column) => {
        possibleSort = nextSort(possibleSort, column, POSSIBLE_DESC_FIRST);
        box.update();
      },
      filter: (patch) => {
        filter = { ...filter, ...patch };
        ctx.ui.savePref(FILTER, JSON.stringify(filter));
        box.update();
      },
    };
    const playerName = (id: PlayerId) => ctx.players.get(id)?.name ?? ownerNames.get(id);
    const playerUrl = (id: PlayerId) => foestatsPlayerUrl(ctx.world, id);

    const box = ctx.createBox({
      id: 'investments',
      settings: 'investments.title',
      title: () => t('investments.title'),
      // nine columns on the possible investments, their heads whole
      width: 640,
      // the lists grow with every building invested in or seen; the height is the viewer's
      resizable: true,
      // the ages are drawn as of now, so each redraw shows them current
      render: () =>
        tab === 'possible'
          ? possibleView(
              possibleViewModel({
                candidates: possible,
                filter,
                sort: possibleSort,
                now: Date.now(),
                greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
                playerName,
                playerUrl,
              }),
              possibleActions,
            )
          : investmentsView(
              investmentsViewModel({
                investments,
                listedAt: ctx.greatBuildings.contributionsAt(),
                now: Date.now(),
                ...(sort && { sort }),
                greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
                playerName,
                playerUrl,
              }),
              actions,
            ),
    });

    /** reads the known buildings again; a stale answer is dropped */
    const load = async () => {
      const current = ++loads;
      const known = await ctx.greatBuildings.known();
      if (current !== loads) return;
      const arc = arcBonus(ctx.cities.own(), ctx.greatBuildings.limitedBonuses());
      investments = myInvestments(known, arc);
      possible = possibleInvestments(
        known,
        (def) => ctx.catalog.get(def)?.greatBuilding,
        arc,
        calculatorFactor(ctx.settings, arc),
        ctx.session.current?.playerId,
      );
      box.update();
    };
    const reload = () => {
      if (box.isOpen) load().catch((error) => logError('reading the investments failed', error));
    };

    ctx.bus.on('greatBuildings.contributions', ({ owners }) => {
      for (const o of owners) ownerNames.set(o.id, o.name);
      if (ctx.settings.get(OPEN_WITH_LIST)) {
        showTab('mine');
        box.open();
      }
      reload();
    });
    // an opened building or an own contribution changes the own place, the progress and the growth
    ctx.bus.on('greatBuilding.opened', ({ own }) => {
      if (!own) reload();
    });
    ctx.bus.on('greatBuilding.changed', reload);
    // a list of another player brings the state of its buildings
    ctx.bus.on('greatBuildings.listed', ({ owner, ownerName }) => {
      if (ownerName !== undefined) ownerNames.set(owner, ownerName);
      reload();
    });
    ctx.bus.on('city.ownChanged', reload);
    // the rewards of a level and the factor decide which places pay
    ctx.bus.on('catalog.updated', reload);
    ctx.settings.onChange(reload);
    ctx.bus.on('player.updated', () => box.update());
    ctx.menu.add({
      id: 'investments',
      icon: ICON,
      label: () => t('investments.menu'),
      action: () => {
        box.toggle();
        reload();
      },
    });
  },
};
