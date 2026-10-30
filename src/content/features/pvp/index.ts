import { foestatsPlayerUrl } from '../../../shared/foestats';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { icons } from '../../ui/icons';
import { PlayerNoteCard } from '../../ui/note-card';
import { KEEP_SETTING, pruneBefore } from './retention';
import { pvpCss } from './styles';
import { type PvpActions, pvpView } from './view';
import {
  opponentsFor,
  PAGE_SIZE,
  type PvpFilter,
  type PvpTab,
  type PvpVm,
  pageCount,
  pvpViewModel,
} from './view-model';

/** the menu entry and the settings group show it */
const ICON = icons.pvp;

export const OPEN_WITH_ARMY = toggleDef({
  key: 'pvp.openWithArmy',
  group: 'pvp.title',
  label: 'pvp.openWithArmy',
  default: true,
});

export const pvpFeature: Feature = {
  id: 'pvp',
  setup(ctx) {
    ctx.settings.registerGroup('pvp.title', ICON);
    const keep = ctx.settings.register(KEEP_SETTING);
    const openWithArmy = ctx.settings.register(OPEN_WITH_ARMY);

    let vm: PvpVm | undefined;
    let tab: PvpTab = 'battles';
    let filter: PvpFilter = { text: '' };
    let page = 0;
    let query = 0;
    const expanded = new Set<number>();
    let shown: Parameters<typeof pvpViewModel>[0] | undefined;

    const refresh = async () => {
      if (!box.isOpen) return;
      const current = ++query;
      const opponents = opponentsFor(
        filter,
        ctx.players.list().filter((p) => p.world === ctx.world),
      );
      const plunderTotals = await ctx.plunders.totals(opponents);
      const incomingTotals = await ctx.incoming.totals(opponents);
      const total =
        tab === 'battles'
          ? await ctx.battles.count(opponents)
          : tab === 'plunders'
            ? plunderTotals.count + plunderTotals.repelled
            : incomingTotals.battles + incomingTotals.plunders;
      page = Math.min(page, pageCount(total) - 1);
      const onPage = { opponents, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      const battles = tab === 'battles' ? await ctx.battles.list(onPage) : [];
      const plunders = tab === 'plunders' ? await ctx.plunders.list(onPage) : [];
      const incoming =
        tab === 'incoming'
          ? await ctx.incoming.list({ attackers: opponents, limit: PAGE_SIZE, offset: onPage.offset })
          : [];
      // a newer query started meanwhile and will render
      if (current !== query) return;
      shown = {
        tab,
        battles,
        plunders,
        total,
        plunderTotals,
        incoming,
        incomingTotals,
        page,
        filter,
        name: (id) => ctx.players.get(id)?.name,
        playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
        building: (id) => ctx.catalog.get(id)?.name,
        resourceName: (id) => ctx.catalog.resourceName(id),
        note: (id) => ctx.notes.playerPage(id)?.text,
        now: Date.now(),
        expanded,
      };
      vm = pvpViewModel(shown);
      box.update();
    };
    const show = () => refresh().catch((error) => logError('loading battles failed', error));

    const actions: PvpActions = {
      tab: (next) => {
        tab = next;
        page = 0;
        show();
      },
      search: (text) => {
        filter = { text };
        page = 0;
        show();
      },
      pick: (opponent) => {
        filter = { text: '', opponent };
        page = 0;
        show();
      },
      clearPick: () => actions.search(''),
      page: (p) => {
        page = p;
        show();
      },
      expand: (battleId) => {
        if (!expanded.delete(battleId)) expanded.add(battleId);
        // the battles of the page are loaded already
        if (shown) vm = pvpViewModel(shown);
        box.update();
      },
      note: (opponent) => {
        actions.pick(opponent);
        card.edit(opponent);
      },
    };

    const box = ctx.createBox({
      id: 'pvp',
      css: pvpCss,
      settings: 'pvp.title',
      title: () => t('pvp.title'),
      width: 520,
      resizable: true,
      render: () => {
        const picked = filter.opponent;
        const note = picked === undefined ? undefined : card.render(picked, ctx.players.get(picked)?.name);
        return pvpView(vm, actions, note);
      },
    });
    const card = new PlayerNoteCard(ctx.notes, () => box.update());

    const prune = () => {
      const before = pruneBefore(keep.get(), Date.now());
      if (before === undefined) return;
      Promise.all([ctx.battles.prune(before), ctx.plunders.prune(before), ctx.incoming.prune(before)])
        .then((deleted) => {
          if (deleted.some((n) => n > 0)) show();
        })
        .catch((error) => logError('pruning battles, plunders and attacks failed', error));
    };
    ctx.bus.on('session.started', prune);
    keep.onChange(prune);

    // The game traffic names no opponent before the battle starts, so the box opens on the battles to search them
    // there. When the page module reads the opponent from the game engine, the box picks it.
    ctx.bus.on('army.opened', ({ battleType }) => {
      if (battleType !== 'pvp' || !openWithArmy.get()) return;
      box.open();
      actions.tab('battles');
    });
    ctx.bus.on('army.target', ({ opponent }) => {
      if (!box.isOpen || !openWithArmy.get()) return;
      actions.pick(opponent);
    });
    ctx.bus.on('battle.recorded', show);
    ctx.bus.on('plunder.recorded', show);
    ctx.bus.on('incoming.recorded', show);
    ctx.bus.on('player.updated', show);
    // the markers in the rows show the notes
    ctx.bus.on('note.changed', show);
    ctx.menu.add({
      id: 'pvp',
      icon: ICON,
      label: () => t('menu.pvp'),
      action: () => {
        box.toggle();
        show();
      },
    });
  },
};
