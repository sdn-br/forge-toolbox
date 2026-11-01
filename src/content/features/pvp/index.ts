import { foestatsPlayerUrl } from '../../../shared/foestats';
import type { PlayerId } from '../../../shared/ids';
import type { IncomingTotals, PlunderTotals } from '../../../shared/model';
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
    // who the filter matched at the last load; undefined means everybody
    let opponentsShown: PlayerId[] | undefined;

    const noPlunders: PlunderTotals = { count: 0, repelled: 0, fp: 0 };
    const noIncoming: IncomingTotals = { battles: 0, held: 0, plunders: 0 };

    // loads what the active tab shows; the plunder totals also stand above the battles
    const refresh = async () => {
      if (!box.isOpen) return;
      const current = ++query;
      // the player list is needed only to turn a search text into opponents
      const searching = filter.opponent === undefined && filter.text.trim() !== '';
      const opponents = opponentsFor(filter, searching ? ctx.players.list().filter((p) => p.world === ctx.world) : []);
      opponentsShown = opponents;
      const [plunderTotals, incomingTotals, battleCount] = await Promise.all([
        tab === 'incoming' ? noPlunders : ctx.plunders.totals(opponents),
        tab === 'incoming' ? ctx.incoming.totals(opponents) : noIncoming,
        tab === 'battles' ? ctx.battles.count(opponents) : 0,
      ]);
      const total =
        tab === 'battles'
          ? battleCount
          : tab === 'plunders'
            ? plunderTotals.count + plunderTotals.repelled
            : incomingTotals.battles + incomingTotals.plunders;
      page = Math.min(page, pageCount(total) - 1);
      const onPage = { opponents, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      const [battles, plunders, incoming] = await Promise.all([
        tab === 'battles' ? ctx.battles.list(onPage) : [],
        tab === 'plunders' ? ctx.plunders.list(onPage) : [],
        tab === 'incoming' ? ctx.incoming.list(onPage) : [],
      ]);
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
        guild: (id) => ctx.players.get(id)?.guild?.name,
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
    // events of one task (a game response often brings several) load once
    let queued = false;
    const show = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        refresh().catch((error) => logError('loading battles failed', error));
      });
    };
    // names, guilds and notes are looked up when the view model is built, so a change of them needs no reading
    const rebuild = () => {
      if (shown) vm = pvpViewModel(shown);
      box.update();
    };
    // a search text matches names, so a changed name can change who matches
    const matchesByName = () => filter.opponent === undefined && filter.text.trim() !== '';
    const touches = (opponents: PlayerId[]) =>
      opponentsShown === undefined || opponents.some((o) => opponentsShown?.includes(o));
    const onRecorded = ({ opponents }: { opponents: PlayerId[] }) => {
      if (touches(opponents)) show();
    };

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
        rebuild();
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
    ctx.bus.on('battle.recorded', onRecorded);
    ctx.bus.on('plunder.recorded', onRecorded);
    ctx.bus.on('incoming.recorded', onRecorded);
    ctx.bus.on('player.updated', () => (matchesByName() ? show() : rebuild()));
    // the markers in the rows show the notes
    ctx.bus.on('note.changed', rebuild);
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
