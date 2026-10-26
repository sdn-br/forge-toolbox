import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { t } from '../../core/texts';
import { assessCity } from '../../domain/assess-city';
import { footprints, spotOf } from '../../domain/city-grid';
import { icons } from '../../ui/icons';
import { PlayerNoteCard } from '../../ui/note-card';
import { type PlunderMarks, sabotageView } from './view';
import { type SabotageVm, sabotageViewModel } from './view-model';
import { visitedRecord } from './visited-record';

/** the menu entry and the settings group show it */
const ICON = icons.sabotage;

const TICK = 30_000;

const ID = 'sabotage';

export const sabotageFeature: Feature = {
  id: ID,
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
        const markPlayer = owner === undefined ? undefined : (marked: boolean) => ctx.players.setMarked(owner, marked);
        // rows set arrows only while the game shows this city; back home the box still shows it, without arrows
        const markable = owner !== undefined && ctx.cities.shown() === owner;
        return sabotageView(vm, note, markable ? marks : undefined, markPlayer);
      },
    });
    const card = new PlayerNoteCard(ctx.notes, () => box.update());

    // a row of "Jetzt plünderbar" sets an arrow on its building in the game, the same row again takes it away
    const marks: PlunderMarks = {
      marked: (building) => {
        const owner = ctx.cities.visited()?.owner;
        return owner !== undefined && ctx.markers.has(ID, owner, building);
      },
      toggle: (building) => {
        const city = ctx.cities.visited();
        if (!city) return;
        if (ctx.markers.has(ID, city.owner, building)) return ctx.markers.clear(ID);
        const b = city.buildings.get(building);
        const [spot] = b ? footprints([b], (id) => ctx.catalog.get(id)).map(spotOf) : [];
        if (spot) ctx.markers.set(ID, city.owner, [spot]);
      },
    };
    ctx.bus.on('markers.changed', () => box.update());
    // the arrow belongs to the visit it was set in; back home or anywhere else it goes (Nutzer, 2026-10-25)
    ctx.bus.on('city.shown', ({ city }) => {
      const marked = ctx.markers.of(ID);
      if (marked && marked.city !== city) ctx.markers.clear(ID);
      box.update();
    });
    // after a plunder, won or repelled, the building has nothing more to give; its arrow goes
    ctx.bus.on('plunder.attempted', ({ opponent, entityId }) => {
      if (ctx.markers.has(ID, opponent, entityId)) ctx.markers.clear(ID);
    });

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
      box.update();
    };
    // what is recorded about the visited player; redraws whenever a part of it arrives
    const record = visitedRecord(ctx, refresh);

    ctx.bus.on('city.visited', ({ owner }) => {
      // the arrow belongs to the city it was set in; the rows now show another city
      const marked = ctx.markers.of(ID);
      if (marked && marked.city !== owner) ctx.markers.clear(ID);
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
