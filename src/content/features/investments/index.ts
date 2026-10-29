import { foestatsPlayerUrl } from '../../../shared/foestats';
import type { PlayerId } from '../../../shared/ids';
import type { KnownGreatBuilding } from '../../../shared/model';
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
import { rowFit } from '../../ui/fit-rows';
import { icons } from '../../ui/icons';
import { nextSort } from '../../ui/sortable';
import { savedReach, savedToggles } from './filter-model';
import { type PossibleActions, possibleView } from './possible-view';
import {
  DEFAULT_FILTER,
  DEFAULT_POSSIBLE_SORT,
  POSSIBLE_DESC_FIRST,
  type PossibleFilter,
  type PossibleSort,
  possibleViewModel,
  TIER_TOGGLES,
  type TierFilter,
} from './possible-view-model';
import { investmentsCss } from './styles';
import { type InvestmentsActions, investmentsView } from './view';
import {
  DEFAULT_MINE_FILTER,
  INVESTMENT_DESC_FIRST,
  type InvestmentSort,
  type InvestmentsTab,
  investmentsViewModel,
  type MineFilter,
  STATUS_TOGGLES,
  type StatusFilter,
} from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.investments;
const OPEN_WITH_LIST = 'investments.openWithList';
/** view choices: the tab and the filters of the possible investments */
const TAB = 'investments.tab';
const FILTER = 'investments.filter';
/** the filters of the own investments, kept apart from those of the possible ones */
const MINE_FILTER = 'investments.mineFilter';
/** the settings the rating reads */

/** the saved tier toggles, each one that is missing at its default */
const savedTier = (f: Partial<PossibleFilter>): TierFilter => savedToggles(TIER_TOGGLES, f.tier, DEFAULT_FILTER.tier);

/** the saved filters, each part that is missing or broken at its default */
function savedFilter(saved: string | undefined): PossibleFilter {
  try {
    const f = JSON.parse(saved ?? '{}') as Partial<PossibleFilter>;
    return {
      player: typeof f.player === 'string' ? f.player : DEFAULT_FILTER.player,
      name: typeof f.name === 'string' ? f.name : DEFAULT_FILTER.name,
      onlyHits: typeof f.onlyHits === 'boolean' ? f.onlyHits : DEFAULT_FILTER.onlyHits,
      reach: savedReach(f),
      tier: savedTier(f),
      onlyMarked: typeof f.onlyMarked === 'boolean' ? f.onlyMarked : DEFAULT_FILTER.onlyMarked,
      showIgnored: typeof f.showIgnored === 'boolean' ? f.showIgnored : DEFAULT_FILTER.showIgnored,
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

/** the saved filters of the own investments, each part that is missing or broken at its default */
function savedMineFilter(saved: string | undefined): MineFilter {
  try {
    const f = JSON.parse(saved ?? '{}') as Partial<MineFilter>;
    return {
      player: typeof f.player === 'string' ? f.player : DEFAULT_MINE_FILTER.player,
      name: typeof f.name === 'string' ? f.name : DEFAULT_MINE_FILTER.name,
      reach: savedReach(f),
      onlyMarked: typeof f.onlyMarked === 'boolean' ? f.onlyMarked : DEFAULT_MINE_FILTER.onlyMarked,
      status: savedToggles<keyof StatusFilter>(STATUS_TOGGLES, f.status, DEFAULT_MINE_FILTER.status),
      showIgnored: typeof f.showIgnored === 'boolean' ? f.showIgnored : DEFAULT_MINE_FILTER.showIgnored,
    };
  } catch {
    return DEFAULT_MINE_FILTER;
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
    let mineFilter = savedMineFilter(ctx.ui.pref(MINE_FILTER));
    /** the known buildings as last read; data events read them again, the other inputs only rate them anew */
    let known: KnownGreatBuilding[] = [];
    let arc = 0;
    let investments: Investments = { rows: [], totals: { circulating: 0, profitSafe: 0, profitTotal: 0 } };
    /** the possible investments, rated only for their tab and kept while the read buildings and bonus stay */
    let rated: { known: KnownGreatBuilding[]; arc: number; rows: PossibleInvestment[] } | undefined;
    /** owner names the town hall list and the lists of others give, for owners the player store does not know */
    const ownerNames = new Map<PlayerId, string>();

    /** the first row in view of each tab, kept inside its list on every draw */
    const tops: Record<InvestmentsTab, number> = { mine: 0, possible: 0 };
    /** how many rows fit into the table area; a change redraws */
    const fit = rowFit(() => box.update());
    const scrollBy = (rows: number) => {
      tops[tab] += rows;
      box.update();
    };

    const showTab = (next: InvestmentsTab) => {
      tab = next;
      ctx.ui.savePref(TAB, next);
    };
    const mark = (owner: PlayerId, entityId: number, marked: boolean) =>
      ctx.greatBuildings
        .mark(owner, entityId, marked)
        .catch((error) => logError('marking a great building failed', error));
    const ignore = (owner: PlayerId, entityId: number, ignored: boolean) =>
      ctx.greatBuildings
        .ignore(owner, entityId, ignored)
        .catch((error) => logError('ignoring a great building failed', error));
    const ignorePlayer = (owner: PlayerId, ignored: boolean) => {
      ctx.players.setIgnored(owner, ignored);
    };
    const markPlayer = (owner: PlayerId, marked: boolean) => {
      ctx.players.setMarked(owner, marked);
    };
    const actions: InvestmentsActions = {
      tab: (next) => {
        showTab(next);
        box.update();
      },
      mark,
      ignore,
      ignorePlayer,
      markPlayer,
      sort: (column, append) => {
        sort = nextSort(sort, column, INVESTMENT_DESC_FIRST, append);
        box.update();
      },
      filter: (patch) => {
        mineFilter = { ...mineFilter, ...patch };
        ctx.ui.savePref(MINE_FILTER, JSON.stringify(mineFilter));
        box.update();
      },
      pickPlayer: (player) => actions.filter({ player }),
      scroll: scrollBy,
      measure: fit.measure,
    };
    const possibleActions: PossibleActions = {
      tab: actions.tab,
      mark,
      ignore,
      ignorePlayer,
      markPlayer,
      sort: (column, append) => {
        possibleSort = nextSort(possibleSort, column, POSSIBLE_DESC_FIRST, append);
        box.update();
      },
      filter: (patch) => {
        filter = { ...filter, ...patch };
        ctx.ui.savePref(FILTER, JSON.stringify(filter));
        box.update();
      },
      pickPlayer: (player) => possibleActions.filter({ player }),
      scroll: scrollBy,
      measure: fit.measure,
    };
    const playerName = (id: PlayerId) => ctx.players.get(id)?.name ?? ownerNames.get(id);
    const playerUrl = (id: PlayerId) => foestatsPlayerUrl(ctx.world, id);
    /** whether the player ignores the owner; undefined for an owner the player store does not know */
    const ownerIgnored = (id: PlayerId) => {
      const player = ctx.players.get(id);
      return player && player.ignored === true;
    };
    const ownArc = () => arcBonus(ctx.cities.own(), ctx.greatBuildings.limitedBonuses());

    const possible = () => {
      if (!rated || rated.known !== known || rated.arc !== arc) {
        const greatBuilding = (def: KnownGreatBuilding['cityEntityId']) => ctx.catalog.get(def)?.greatBuilding;
        const rows = possibleInvestments(known, greatBuilding, arc, ctx.session.current?.playerId);
        rated = { known, arc, rows };
      }
      return rated.rows;
    };

    /** the height the box needs for what always shows, so the table area never gets a second scrollbar: border 4 +
     * header 29 + body padding 12 + tabs 32 + filter row 46 (22 high, 2 x 12 margin) + the totals of the own tab at
     * their tallest, two lines of 60 (one line 41, the line of the selection 19 more) + head row 22 + two rows
     * 2 x 23 + the line of hidden rows 21 = 272, rounded up. Worked out from the styles, not measured.
     * debt: kept by hand. ceiling: a filter row or the totals line (with its ignored note) that wraps (a narrow box, the long hint without a town hall list), other
     * fonts or a changed padding need more. upgrade: measure the fixed parts in the box once a second box needs it */
    const MIN_HEIGHT = 275;
    const WIDTH = 850;

    const render = () => {
      if (tab === 'possible') {
        const vm = possibleViewModel({
          candidates: possible(),
          filter,
          sort: possibleSort,
          visible: fit.rows(),
          scroll: tops.possible,
          now: Date.now(),
          greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
          playerName,
          relations: (id) => ctx.players.get(id)?.relations,
          isMarked: (owner, entityId) => ctx.greatBuildings.isMarked(owner, entityId),
          ownerMarked: (id) => ctx.players.get(id)?.marked === true,
          isIgnored: (owner, entityId) => ctx.greatBuildings.isIgnored(owner, entityId),
          ownerIgnored,
          playerUrl,
        });
        tops.possible = vm.scroll.top;
        return possibleView(vm, possibleActions);
      }
      const vm = investmentsViewModel({
        investments,
        listedAt: ctx.greatBuildings.contributionsAt(),
        now: Date.now(),
        ...(sort && { sort }),
        visible: fit.rows(),
        scroll: tops.mine,
        greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
        playerName,
        playerUrl,
        isMarked: (owner, entityId) => ctx.greatBuildings.isMarked(owner, entityId),
        ownerMarked: (id) => ctx.players.get(id)?.marked === true,
        isIgnored: (owner, entityId) => ctx.greatBuildings.isIgnored(owner, entityId),
        ownerIgnored,
        filter: mineFilter,
        relations: (id) => ctx.players.get(id)?.relations,
      });
      tops.mine = vm.scroll.top;
      return investmentsView(vm, actions);
    };

    const box = ctx.createBox({
      id: 'investments',
      css: investmentsCss,
      settings: 'investments.title',
      title: () => t('investments.title'),
      // twelve columns on the possible investments, their heads whole
      width: WIDTH,
      // the lists grow with every building invested in or seen; the height is the viewer's. It starts tall, since the
      // rows that fit are counted in the height the box gives the table
      resizable: true,
      defaultSize: (win) => ({ width: WIDTH, height: Math.min(win.height * 0.7, 600) }),
      minHeight: MIN_HEIGHT,
      // the ages are drawn as of now, so each redraw shows them current
      render,
    });

    const rate = () => {
      arc = ownArc();
      investments = myInvestments(known, arc);
      box.update();
    };
    const rerate = () => {
      if (box.isOpen) rate();
    };

    let loading = false;
    let again = false;
    /** reads the known buildings; what triggers a read while one runs gets one more read after it */
    const load = async () => {
      if (loading) {
        again = true;
        return;
      }
      loading = true;
      try {
        // the events of one game response come together and share the read
        await Promise.resolve();
        do {
          again = false;
          known = await ctx.greatBuildings.known();
        } while (again);
      } finally {
        loading = false;
      }
      rate();
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
    // a star put on or taken from a building shows at once, the data stay as read
    ctx.bus.on('greatBuilding.marked', () => box.update());
    ctx.bus.on('greatBuilding.ignored', () => box.update());
    // a list of another player brings the state of its buildings
    ctx.bus.on('greatBuildings.listed', ({ owner, ownerName }) => {
      if (ownerName !== undefined) ownerNames.set(owner, ownerName);
      reload();
    });
    // every collection in the own city reports a change; only the Arc bonus counts
    ctx.bus.on('city.ownChanged', () => {
      if (ownArc() !== arc) rerate();
    });
    // the rewards of a level decide which places pay
    ctx.bus.on('catalog.updated', () => {
      rated = undefined;
      rerate();
    });
    // names and relations, for example a new friend or the social list at the start
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
