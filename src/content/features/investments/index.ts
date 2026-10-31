import { html } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { rowFit } from '../../ui/fit-rows';
import { icons } from '../../ui/icons';
import { tabBar } from '../../ui/tabs';
import { gbLookups } from '../shared/gb-lookups';
import { createMineSection } from './mine/section';
import { createPossibleSection } from './possible/section';
import { ownerRatings } from './ratings';
import { investmentsCss } from './styles';

/** the tabs of the box: the own investments and the buildings of others worth a place */
type InvestmentsTab = 'mine' | 'possible';
const TABS: InvestmentsTab[] = ['mine', 'possible'];

/** the menu entry and the settings group show it */
const ICON = icons.investments;
export const OPEN_WITH_LIST = toggleDef({
  key: 'investments.openWithList',
  group: 'investments.title',
  label: 'investments.openSetting',
  default: true,
});
/** view choice: the tab; each tab keeps its own filters */
const TAB = 'investments.tab';

export const investmentsFeature: Feature = {
  id: 'investments',
  setup(ctx) {
    ctx.settings.registerGroup('investments.title', ICON);
    const openWithList = ctx.settings.register(OPEN_WITH_LIST);

    let tab: InvestmentsTab = ctx.ui.pref(TAB) === 'possible' ? 'possible' : 'mine';
    /** the known buildings as last read, by owner; a stored owner is read again, the other inputs only rate anew. The
     * possible investments are rated only for their tab */
    const ratings = ownerRatings(
      (def) => ctx.catalog.get(def)?.greatBuilding,
      () => ctx.session.current?.playerId,
    );

    /** how many rows fit into the table area; a change redraws */
    const fit = rowFit(() => box.update());

    const showTab = (next: InvestmentsTab) => {
      tab = next;
      ctx.ui.savePref(TAB, next);
    };
    const pickTab = (next: InvestmentsTab) => {
      showTab(next);
      box.update();
    };
    const lookups = gbLookups(ctx);
    /** grows with every change the lookups see; the tabs filter and sort anew then */
    let revision = 0;
    const relookup = () => {
      revision++;
      box.update();
    };
    const ownArc = () => ctx.playerBonuses.arcBonus();

    /** the height the box needs for what always shows, so the table area never gets a second scrollbar: border 4 +
     * header 29 + body padding 12 + tabs 32 + filter row 46 (22 high, 2 x 12 margin) + the totals of the own tab at
     * their tallest, two lines of 60 (one line 41, the line of the selection 19 more) + head row 22 + two rows
     * 2 x 23 + the line of hidden rows 21 = 272, rounded up. Worked out from the styles, not measured.
     * debt: kept by hand. ceiling: a filter row or the totals line (with its ignored note) that wraps (a narrow box, the long hint without a town hall list), other
     * fonts or a changed padding need more. upgrade: measure the fixed parts in the box once a second box needs it */
    const MIN_HEIGHT = 275;
    const WIDTH = 850;

    const render = () => {
      const frame = { lookups, visible: fit.rows(), now: Date.now(), revision };
      const content =
        tab === 'possible' ? possible.render(frame, ratings.candidates()) : mine.render(frame, ratings.investments());
      // tabs, filters and the totals or count stay, the rows that fit are drawn and the two buttons scroll them
      return html`<div class="inv-pane">${tabBar(TABS, tab, (key) => t(`investments.tab.${key}`), pickTab)}${content}</div>`;
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
      fill: true,
      defaultSize: (win) => ({ width: WIDTH, height: Math.min(win.height * 0.7, 600) }),
      minHeight: MIN_HEIGHT,
      // the ages are drawn as of now, so each redraw shows them current
      render,
    });
    const mine = createMineSection(ctx, box, fit.measure);
    const possible = createPossibleSection(ctx, box, fit.measure);

    const rate = () => {
      ratings.setArc(ownArc());
      box.update();
    };
    const rerate = () => {
      if (box.isOpen) rate();
    };

    /** what to read on the next read: every owner (before the first read, after the box was closed meanwhile), or the
     * owners stored since the last one */
    let pending: Set<PlayerId> | 'all' = 'all';
    let loading = false;
    /** reads what is pending; what is stored while a read runs is read right after it */
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        // the events of one game response come together and share the read
        await Promise.resolve();
        while (pending === 'all' || pending.size > 0) {
          const next = pending;
          pending = new Set();
          if (next === 'all') ratings.replaceAll(await ctx.greatBuildings.known());
          else {
            const owners = [...next];
            const rows = await Promise.all(owners.map((owner) => ctx.greatBuildings.known(owner)));
            owners.forEach((owner, i) => {
              ratings.replace(owner, rows[i] ?? []);
            });
          }
        }
      } catch (error) {
        // what failed may be anything; the next read reads all
        pending = 'all';
        throw error;
      } finally {
        loading = false;
      }
      rate();
    };
    const read = () => load().catch((error) => logError('reading the investments failed', error));
    /** the box opened: it reads what it missed while closed, else it rates what it holds */
    const opened = () => {
      if (pending === 'all' || pending.size > 0) read();
      else rate();
    };

    // the town hall list opens the box; it is read once the store wrote it (`greatBuildings.stored` without an owner)
    ctx.bus.on('greatBuildings.contributions', () => {
      if (openWithList.get()) {
        showTab('mine');
        box.open();
      }
    });
    // a list, an opened or a changed building of another player, or the town hall list, once it is in the database:
    // the box reads that owner alone, every owner after the town hall list or when it was closed meanwhile
    ctx.bus.on('greatBuildings.stored', ({ owner }) => {
      if (owner === undefined || !box.isOpen) pending = 'all';
      else if (pending !== 'all') pending.add(owner);
      if (box.isOpen) read();
    });
    // a star put on or taken from a building shows at once, the data stay as read
    ctx.bus.on('greatBuilding.marked', relookup);
    ctx.bus.on('greatBuilding.ignored', relookup);
    // every collection in the own city reports a change; only the Arc bonus counts
    ctx.bus.on('city.ownChanged', () => {
      if (ownArc() !== ratings.arc()) rerate();
    });
    // the rewards of a level decide which places pay
    ctx.bus.on('catalog.updated', () => {
      // and the names of the buildings
      revision++;
      ratings.rewardsChanged();
      rerate();
    });
    // names and relations, for example a new friend or the social list at the start
    ctx.bus.on('player.updated', relookup);
    ctx.menu.add({
      id: 'investments',
      icon: ICON,
      label: () => t('investments.menu'),
      action: () => {
        box.toggle();
        if (box.isOpen) opened();
      },
    });
  },
};
