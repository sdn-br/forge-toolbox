import type { PlayerId } from '../../../shared/ids';
import type { Battle } from '../../../shared/model';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { assessCity } from '../../domain/assess-city';
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
    const box = ctx.createBox({
      id: 'sabotage',
      title: () => t('sabotage.title'),
      width: 400,
      render: () => sabotageView(vm),
    });

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

    ctx.bus.on('city.visited', ({ owner }) => {
      refresh();
      loadLastBattle(owner);
      if (ctx.settings.get('sabotage.autoOpen')) box.open();
    });
    ctx.bus.on('battle.recorded', ({ opponent }) => {
      if (ctx.cities.visited()?.owner === opponent) loadLastBattle(opponent);
    });
    ctx.bus.on('city.visitedChanged', refresh);
    ctx.bus.on('catalog.updated', ({ defs }) => {
      const city = ctx.cities.visited();
      if (city && [...city.buildings.values()].some((b) => defs.includes(b.def))) refresh();
    });
    ctx.settings.onChange(refresh);
    ctx.menu.add({ id: 'sabotage', icon: '🏰', label: () => t('sabotage.menu'), action: () => box.toggle() });
  },
};
