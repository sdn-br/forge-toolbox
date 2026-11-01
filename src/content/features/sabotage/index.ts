import type { Feature } from '../../core/feature';
import { logError } from '../../core/log';
import { spotOf } from '../../core/markers';
import { toggleDef } from '../../core/settings';
import { t } from '../../core/texts';
import { assessCity, type CityAssessment } from '../../domain/assess-city';
import { footprints } from '../../domain/city-grid';
import type { VisitedCity } from '../../stores/cities';
import { icons } from '../../ui/icons';
import { PlayerNoteCard } from '../../ui/note-card';
import { playerLookups, playerRowActions } from '../shared/player-lookups';
import { sabotageCss } from './styles';
import { type PlunderMarks, sabotageView } from './view';
import { type SabotageVm, sabotageViewModel } from './view-model';
import { visitedRecord } from './visited-record';

/** the menu entry and the settings group show it */
const ICON = icons.sabotage;

const TICK = 30_000;

const ID = 'sabotage';

export const AUTO_OPEN = toggleDef({
  key: 'sabotage.autoOpen',
  group: 'sabotage.title',
  label: 'sabotage.autoOpen',
  default: true,
});
export const SHOW_ARMY = toggleDef({
  key: 'sabotage.showArmy',
  group: 'sabotage.title',
  label: 'sabotage.showArmy',
  default: true,
});

export const sabotageFeature: Feature = {
  id: ID,
  setup(ctx) {
    ctx.settings.registerGroup('sabotage.title', ICON);
    const autoOpen = ctx.settings.register(AUTO_OPEN);
    const showArmy = ctx.settings.register(SHOW_ARMY);

    let vm: SabotageVm | undefined;
    const lookups = playerLookups(ctx);
    const playerActions = playerRowActions(ctx);
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
      id: ID,
      css: sabotageCss,
      settings: 'sabotage.title',
      title: () => t('sabotage.title'),
      width: 400,
      render: () => {
        keepTicking();
        const owner = ctx.cities.visited()?.owner;
        const note = vm && owner !== undefined ? card.render(owner, ctx.players.get(owner)?.name) : undefined;
        const playerMarks =
          owner === undefined
            ? undefined
            : {
                mark: (marked: boolean) => playerActions.markPlayer(owner, marked),
                ignore: (ignored: boolean) => playerActions.ignorePlayer(owner, ignored),
              };
        // rows set arrows only while the game shows this city; back home the box still shows it, without arrows
        const markable = owner !== undefined && ctx.cities.shown() === owner;
        return sabotageView(vm, note, markable ? marks : undefined, playerMarks);
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

    // The assessment depends on the city and the catalog only, so ticks and arriving parts of the record reuse it. The
    // city object is edited in place and the catalog grows, so those events drop it.
    let assessed: { city: VisitedCity; assessment: CityAssessment } | undefined;
    const assess = (city: VisitedCity) => {
      if (assessed?.city !== city) {
        assessed = {
          city,
          assessment: assessCity(city, {
            def: (id) => ctx.catalog.get(id),
            eraByLevel: (l) => ctx.catalog.eraByLevel(l),
          }),
        };
      }
      return assessed.assessment;
    };

    // a closed box draws nothing; it builds the view model when it opens
    const refresh = () => {
      const city = ctx.cities.visited();
      if (!city || !box.isOpen) return;
      const assessment = assess(city);
      vm = sabotageViewModel({
        city,
        player: ctx.players.get(city.owner),
        lookups,
        assessment,
        catalog: ctx.catalog,
        showArmy: showArmy.get(),
        now: Date.now(),
        record: record.current(city.owner),
      });
      box.update();
    };
    // what is recorded about the visited player; redraws whenever a part of it arrives
    const record = visitedRecord(ctx, refresh, () => box.isOpen);

    const open = () => {
      const owner = ctx.cities.visited()?.owner;
      box.open();
      if (owner !== undefined) record.sync(owner);
      refresh();
    };

    ctx.bus.on('city.visited', ({ owner }) => {
      // the arrow belongs to the city it was set in; the rows now show another city
      const marked = ctx.markers.of(ID);
      if (marked && marked.city !== owner) ctx.markers.clear(ID);
      assessed = undefined;
      if (autoOpen.get() && !box.isOpen) open();
      else refresh();
    });
    // the attack timers come with updatePlayer, for example after a battle or a plunder
    ctx.bus.on('player.updated', ({ ids }) => {
      const owner = ctx.cities.visited()?.owner;
      if (owner !== undefined && ids.includes(owner)) refresh();
    });
    ctx.bus.on('session.started', () => {
      ctx.shields.prune().catch((error) => logError('pruning city shields failed', error));
    });
    ctx.bus.on('city.visitedChanged', () => {
      assessed = undefined;
      refresh();
    });
    ctx.bus.on('note.changed', ({ player }) => {
      if (player === undefined || player === ctx.cities.visited()?.owner) box.update();
    });
    ctx.bus.on('catalog.updated', ({ defs }) => {
      const city = ctx.cities.visited();
      if (city && [...city.buildings.values()].some((b) => defs.includes(b.def))) {
        assessed = undefined;
        refresh();
      }
    });
    // the view model reads this setting only
    showArmy.onChange(refresh);
    ctx.menu.add({
      id: ID,
      icon: ICON,
      label: () => t('sabotage.menu'),
      action: () => (box.isOpen ? box.close() : open()),
    });
  },
};
