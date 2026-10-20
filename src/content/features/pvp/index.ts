import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { PlayerNoteCard } from '../../ui/note-card';
import { KEEP_SETTING, pruneBefore } from './retention';
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

export const pvpFeature: Feature = {
  id: 'pvp',
  setup(ctx) {
    ctx.settings.register(KEEP_SETTING);
    ctx.settings.register({
      key: 'pvp.openWithArmy',
      group: 'pvp.title',
      label: 'pvp.openWithArmy',
      default: true,
    });

    let vm: PvpVm | undefined;
    let tab: PvpTab = 'battles';
    let filter: PvpFilter = { text: '' };
    let page = 0;
    let query = 0;

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
      vm = pvpViewModel({
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
        building: (id) => ctx.catalog.get(id)?.name,
        resourceName: (id) => ctx.catalog.resourceName(id),
        note: (id) => ctx.notes.playerPage(id)?.text,
        now: Date.now(),
      });
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
      note: (opponent) => {
        actions.pick(opponent);
        card.edit(opponent);
      },
    };

    const box = ctx.createBox({
      id: 'pvp',
      title: () => t('pvp.title'),
      width: 520,
      render: () => {
        const picked = filter.opponent;
        const note = picked === undefined ? undefined : card.render(picked, ctx.players.get(picked)?.name);
        return pvpView(vm, actions, note);
      },
    });
    const card = new PlayerNoteCard(ctx.notes, () => box.update());

    const prune = () => {
      const before = pruneBefore(ctx.settings.choice(KEEP_SETTING.key), Date.now());
      if (before === undefined) return;
      Promise.all([ctx.battles.prune(before), ctx.plunders.prune(before), ctx.incoming.prune(before)])
        .then((deleted) => {
          if (deleted.some((n) => n > 0)) show();
        })
        .catch((error) => logError('pruning battles, plunders and attacks failed', error));
    };
    ctx.bus.on('session.started', prune);
    ctx.settings.onChange((key) => {
      if (key === KEEP_SETTING.key) prune();
    });

    // The game names no opponent before the battle starts, so the box opens on the battles to search them there.
    ctx.bus.on('army.opened', ({ battleType }) => {
      if (battleType !== 'pvp' || !ctx.settings.get('pvp.openWithArmy')) return;
      box.open();
      actions.tab('battles');
    });
    ctx.bus.on('battle.recorded', show);
    ctx.bus.on('plunder.recorded', show);
    ctx.bus.on('incoming.recorded', show);
    ctx.bus.on('player.updated', show);
    // the markers in the rows show the notes
    ctx.bus.on('note.changed', show);
    ctx.menu.add({
      id: 'pvp',
      icon: '⚔️',
      label: () => t('menu.pvp'),
      action: () => {
        box.toggle();
        show();
      },
    });
  },
};
