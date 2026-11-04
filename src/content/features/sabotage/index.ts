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
import { clampTop } from '../../ui/windowed-rows';
import { playerLookups, playerRowActions } from '../shared/player-lookups';
import { sabotageCss } from './styles';
import { type PlunderMarks, type SabotageTab, type SabotageUi, sabotageView, VISIBLE_ROWS } from './view';
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
    // every visit starts on Plündern with the note card closed; ticks and store updates keep what was chosen since
    let tab: SabotageTab = 'plunder';
    let noteOpen = false;
    // the first plunder row in view; back to the top on every visit, kept on redraws
    let plunderTop = 0;
    // counts the visits: the content area starts at the top again on each
    let visit = 0;
    // the content area of the Plündern tab; its height at the switch to Kampf is the height of that tab, so the box
    // keeps its size (unmeasured, as in a test without layout: the Kampf tab has the height of its content)
    let plunderArea: Element | undefined;
    // Rows of the window: up to VISIBLE_ROWS. The box is capped at 70% of the window, so a small window leaves less room
    // than five rows plus the head: the count goes down by one per overflow seen and back to the maximum when the area
    // grows or a visit starts. Each step is a redraw the observer sees again, so it ends when the area fits or at one row.
    let visibleRows = VISIBLE_ROWS;
    let areaHeight: number | undefined;
    let observer: ResizeObserver | undefined;
    const fit = () => {
      const area = plunderArea as HTMLElement | undefined;
      const height = area?.clientHeight ?? 0;
      // no layout (a test, a closed box): nothing to follow
      if (!area || height <= 0) return;
      const grown = areaHeight !== undefined && height > areaHeight;
      areaHeight = height;
      if (grown && visibleRows < VISIBLE_ROWS) {
        visibleRows = VISIBLE_ROWS;
        box.update();
      } else if (area.scrollHeight > height + 2 && visibleRows > 1) {
        visibleRows--;
        box.update();
      }
    };
    // the area, and the list in it: the list changes its height with the count of rows, the area with the window
    const measure = (area: Element | undefined) => {
      plunderArea = area;
      areaHeight = undefined;
      observer?.disconnect();
      if (!area || typeof ResizeObserver === 'undefined') return;
      observer ??= new ResizeObserver(fit);
      observer.observe(area);
      const list = area.querySelector('.plunder-list');
      if (list) observer.observe(list);
    };
    let fightHeight: number | undefined;
    const rowsCount = () => vm?.plunderable.length ?? 0;
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
        // a shorter list leaves no offset beyond its end
        plunderTop = clampTop(plunderTop, rowsCount(), visibleRows);
        const owner = ctx.cities.visited()?.owner;
        const note = vm && owner !== undefined ? card.render(owner, ctx.players.get(owner)?.name) : undefined;
        const playerMarks =
          owner === undefined
            ? undefined
            : {
                plunder: (value: boolean) => playerActions.plunderPlayer(owner, value),
                noAttack: (value: boolean) => playerActions.noAttackPlayer(owner, value),
              };
        // rows set arrows only while the game shows this city; back home the box still shows it, without arrows
        const markable = owner !== undefined && ctx.cities.shown() === owner;
        const ui: SabotageUi = {
          tab,
          pickTab: (next) => {
            if (tab === 'plunder' && plunderArea)
              fightHeight = (plunderArea as HTMLElement).offsetHeight || fightHeight;
            tab = next;
            box.update();
          },
          noteText: owner === undefined ? '' : (ctx.notes.playerPage(owner)?.text ?? ''),
          noteOpen,
          toggleNote: () => {
            noteOpen = !noteOpen;
            box.update();
          },
          visit,
          measure,
          visibleRows,
          ...(fightHeight && { fightHeight }),
          plunderTop,
          scrollPlunder: (rows) => {
            plunderTop = clampTop(plunderTop + rows, rowsCount(), visibleRows);
            box.update();
          },
        };
        return sabotageView(vm, ui, note, markable ? marks : undefined, playerMarks);
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
        assets: ctx.assets,
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
      tab = 'plunder';
      noteOpen = false;
      plunderTop = 0;
      visibleRows = VISIBLE_ROWS;
      visit++;
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
    // the portraits in the details of the last battle are looked up when the view model is built
    ctx.bus.on('assets.loaded', refresh);
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
