import { foestatsPlayerUrl } from '../../../shared/foestats';
import type { PlayerId } from '../../../shared/ids';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { arcBonus } from '../../domain/gb-calculator';
import { type Investments, myInvestments } from '../../domain/investments';
import { icons } from '../../ui/icons';
import { type InvestmentsActions, investmentsView } from './view';
import { type InvestmentSort, type InvestmentsTab, investmentsViewModel, nextSort } from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.investments;
const OPEN_WITH_LIST = 'investments.openWithList';

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

    /** when the last town hall list came; the store keeps it across reloads */
    let listedAt: number | undefined;
    let tab: InvestmentsTab = 'mine';
    let sort: InvestmentSort | undefined;
    let investments: Investments = { rows: [], totals: { circulating: 0, profitSafe: 0, profitTotal: 0 } };
    /** owner names the town hall list gives, for owners the player store does not know */
    const ownerNames = new Map<PlayerId, string>();
    let loads = 0;

    const actions: InvestmentsActions = {
      tab: (next) => {
        tab = next;
        box.update();
      },
      sort: (column) => {
        sort = nextSort(sort, column);
        box.update();
      },
    };

    const box = ctx.createBox({
      id: 'investments',
      settings: 'investments.title',
      title: () => t('investments.title'),
      width: 520,
      // the list grows with every building invested in; the height is the viewer's
      resizable: true,
      // the age is drawn as of now, so each redraw shows it current
      render: () =>
        investmentsView(
          investmentsViewModel({
            tab,
            investments,
            ...(listedAt !== undefined && { listedAt }),
            now: Date.now(),
            ...(sort && { sort }),
            greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
            playerName: (id) => ctx.players.get(id)?.name ?? ownerNames.get(id),
            playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
          }),
          actions,
        ),
    });

    ctx.greatBuildings
      .contributionsAt()
      .then((at) => {
        // a list arriving meanwhile is newer
        if (listedAt !== undefined || at === undefined) return;
        listedAt = at;
        box.update();
      })
      .catch((error) => logError('reading the time of the town hall list failed', error));

    /** reads the known buildings again; a stale answer is dropped */
    const load = async () => {
      const current = ++loads;
      const known = await ctx.greatBuildings.known();
      if (current !== loads) return;
      investments = myInvestments(known, arcBonus(ctx.cities.own(), ctx.greatBuildings.limitedBonuses()));
      box.update();
    };
    const reload = () => {
      if (box.isOpen) load().catch((error) => logError('reading the investments failed', error));
    };

    ctx.bus.on('greatBuildings.contributions', ({ at, owners }) => {
      listedAt = at;
      for (const o of owners) ownerNames.set(o.id, o.name);
      if (ctx.settings.get(OPEN_WITH_LIST)) {
        tab = 'mine';
        box.open();
      }
      reload();
    });
    // an opened building or an own contribution changes the own place, the progress and the growth
    ctx.bus.on('greatBuilding.opened', ({ own }) => {
      if (!own) reload();
    });
    ctx.bus.on('greatBuilding.changed', reload);
    ctx.bus.on('city.ownChanged', reload);
    ctx.bus.on('catalog.updated', () => box.update());
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
