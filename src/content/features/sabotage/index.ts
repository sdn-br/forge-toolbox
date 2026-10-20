import type { PlayerId } from '../../../shared/ids';
import type { Battle, IncomingAttack, IncomingTotals, Plunder, PlunderTotals } from '../../../shared/model';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { assessCity } from '../../domain/assess-city';
import { PlayerNoteCard } from '../../ui/note-card';
import { sabotageView } from './view';
import { type SabotageVm, sabotageViewModel } from './view-model';

export const sabotageFeature: Feature = {
  id: 'sabotage',
  setup(ctx) {
    ctx.settings.register({
      key: 'sabotage.autoOpen',
      group: 'sabotage.title',
      label: 'sabotage.autoOpen',
      default: true,
    });
    ctx.settings.register({
      key: 'sabotage.showArmy',
      group: 'sabotage.title',
      label: 'sabotage.showArmy',
      default: true,
    });

    let vm: SabotageVm | undefined;
    let lastBattle: Battle | undefined;
    let plunders: { owner: PlayerId; last?: Plunder; totals: PlunderTotals } | undefined;
    let incoming: { owner: PlayerId; last?: IncomingAttack; totals: IncomingTotals } | undefined;
    const box = ctx.createBox({
      id: 'sabotage',
      title: () => t('sabotage.title'),
      width: 400,
      render: () => {
        const owner = ctx.cities.visited()?.owner;
        const note = vm && owner !== undefined ? card.render(owner, ctx.players.get(owner)?.name) : undefined;
        return sabotageView(vm, note);
      },
    });
    const card = new PlayerNoteCard(ctx.notes, () => box.update());

    const refresh = () => {
      const city = ctx.cities.visited();
      if (!city) return;
      const assessment = assessCity(city, {
        def: (id) => ctx.catalog.get(id),
        eraByLevel: (l) => ctx.catalog.eraByLevel(l),
      });
      vm = sabotageViewModel(
        city,
        ctx.players.get(city.owner),
        assessment,
        ctx.catalog,
        ctx.settings.get('sabotage.showArmy'),
        Date.now(),
        lastBattle?.opponent === city.owner ? lastBattle : undefined,
        plunders?.owner === city.owner ? plunders : undefined,
        incoming?.owner === city.owner ? incoming : undefined,
      );
      box.update();
    };

    const loadLastBattle = (owner: PlayerId) =>
      ctx.battles.latest(owner).then(
        (battle) => {
          if (ctx.cities.visited()?.owner !== owner) return;
          lastBattle = battle;
          refresh();
        },
        (error) => logError('loading the last battle failed', error),
      );

    const loadPlunders = (owner: PlayerId) =>
      Promise.all([ctx.plunders.latest(owner), ctx.plunders.totals([owner])]).then(
        ([last, totals]) => {
          if (ctx.cities.visited()?.owner !== owner) return;
          plunders = { owner, last, totals };
          refresh();
        },
        (error) => logError('loading plunders failed', error),
      );

    const loadIncoming = (owner: PlayerId) =>
      Promise.all([ctx.incoming.latest(owner), ctx.incoming.totals([owner])]).then(
        ([last, totals]) => {
          if (ctx.cities.visited()?.owner !== owner) return;
          incoming = { owner, last, totals };
          refresh();
        },
        (error) => logError('loading attacks on the own city failed', error),
      );

    ctx.bus.on('city.visited', ({ owner }) => {
      refresh();
      loadLastBattle(owner);
      loadPlunders(owner);
      loadIncoming(owner);
      if (ctx.settings.get('sabotage.autoOpen')) box.open();
    });
    ctx.bus.on('battle.recorded', ({ opponent }) => {
      if (ctx.cities.visited()?.owner === opponent) loadLastBattle(opponent);
    });
    ctx.bus.on('plunder.recorded', ({ opponent }) => {
      if (ctx.cities.visited()?.owner === opponent) loadPlunders(opponent);
    });
    ctx.bus.on('incoming.recorded', ({ attacker }) => {
      if (ctx.cities.visited()?.owner === attacker) loadIncoming(attacker);
    });
    ctx.bus.on('city.visitedChanged', refresh);
    ctx.bus.on('note.changed', ({ player }) => {
      if (player === undefined || player === ctx.cities.visited()?.owner) box.update();
    });
    ctx.bus.on('catalog.updated', ({ defs }) => {
      const city = ctx.cities.visited();
      if (city && [...city.buildings.values()].some((b) => defs.includes(b.def))) refresh();
    });
    ctx.settings.onChange(refresh);
    ctx.menu.add({ id: 'sabotage', icon: '🏰', label: () => t('sabotage.menu'), action: () => box.toggle() });
  },
};
