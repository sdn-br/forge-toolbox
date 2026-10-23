import { html } from 'lit-html';
import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { assessCity } from '../../domain/assess-city';
import { CityMap, legendView } from '../../ui/city-map';
import { icons } from '../../ui/icons';
import { toMode } from '../../ui/map-projection';
import { PlayerNoteCard } from '../../ui/note-card';
import { type VisitedMapVm, visitedCityMap } from './city-map';
import { type SabotageActions, sabotageView } from './view';
import { type SabotageVm, sabotageViewModel } from './view-model';
import { visitedRecord } from './visited-record';

/** the menu entry and the settings group show it */
const ICON = icons.sabotage;

const TICK = 30_000;

export const sabotageFeature: Feature = {
  id: 'sabotage',
  setup(ctx) {
    ctx.settings.registerGroup('sabotage.title', ICON);
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
    let mapVm: VisitedMapVm | undefined;
    /** the building picked in the list of plunderable ones; a new visit drops it */
    let focused: number | undefined;
    const MODE = 'cityMap.visited.mode';
    const map = new CityMap({ mode: toMode(ctx.ui.pref(MODE)), onMode: (mode) => ctx.ui.savePref(MODE, mode) });
    // the map of the visited city in a box of its own; it follows the visits and keeps the last city after going home
    const mapBox = ctx.createBox({
      id: 'visitedCityMap',
      title: () => {
        const owner = ctx.cities.visited()?.owner;
        const name = owner === undefined ? undefined : ctx.players.get(owner)?.name;
        return name ? t('sabotage.mapTitle', { name }) : t('cityMap.title');
      },
      width: 500,
      fill: true,
      render: () =>
        mapVm ? map.render(mapVm.data, legendView(mapVm.legend)) : html`<p class="muted">${t('sabotage.noMap')}</p>`,
    });
    const actions: SabotageActions = {
      // the map button shows the city in its start view, without the building picked before
      openMap: () => {
        focused = undefined;
        refresh();
        mapBox.open();
        map.showCity();
      },
      showOnMap: (building) => {
        focused = building;
        refresh();
        mapBox.open();
        const rect = mapVm?.data.focus?.rect;
        if (rect) map.focus(rect);
      },
    };
    // the countdowns of the attack line run on while the box is open; the ticker stops with the box
    let ticker: ReturnType<typeof setInterval> | undefined;
    const keepTicking = () => {
      ticker ??= setInterval(() => {
        if (box.isOpen) return refresh();
        clearInterval(ticker);
        ticker = undefined;
      }, TICK);
    };
    const box = ctx.createBox({
      id: 'sabotage',
      settings: 'sabotage.title',
      title: () => t('sabotage.title'),
      width: 400,
      render: () => {
        keepTicking();
        const owner = ctx.cities.visited()?.owner;
        const note = vm && owner !== undefined ? card.render(owner, ctx.players.get(owner)?.name) : undefined;
        return sabotageView(vm, note, mapVm && actions);
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
      vm = sabotageViewModel({
        city,
        player: ctx.players.get(city.owner),
        assessment,
        catalog: ctx.catalog,
        showArmy: ctx.settings.get('sabotage.showArmy'),
        now: Date.now(),
        record: record.current(city.owner),
      });
      mapVm = city.buildings.size > 0 ? visitedCityMap(city, assessment.plunderable, ctx.catalog, focused) : undefined;
      box.update();
      mapBox.update();
    };
    // what is recorded about the visited player; redraws whenever a part of it arrives
    const record = visitedRecord(ctx, refresh);

    ctx.bus.on('city.visited', () => {
      focused = undefined;
      refresh();
      if (ctx.settings.get('sabotage.autoOpen')) box.open();
    });
    // the attack timers come with updatePlayer, for example after a battle or a plunder
    ctx.bus.on('player.updated', ({ ids }) => {
      const owner = ctx.cities.visited()?.owner;
      if (owner !== undefined && ids.includes(owner)) refresh();
    });
    ctx.bus.on('session.started', () => {
      ctx.shields.prune().catch((error) => logError('pruning city shields failed', error));
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
    ctx.menu.add({ id: 'sabotage', icon: ICON, label: () => t('sabotage.menu'), action: () => box.toggle() });
  },
};
