// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { type Bounds, footprints, gridBounds } from '../src/content/domain/city-grid';
import { cityMapFeature } from '../src/content/features/city-map/index';
import { toBuildingDef } from '../src/content/game/building-defs';
import { toCity, toResearchExpansions } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import type { Building, City } from '../src/content/model/city';
import { START_VIEW } from '../src/content/ui/city-map';
import { project, toScreen } from '../src/content/ui/map-projection';
import { buildingDefId, playerId, worldId } from '../src/shared/ids';
import ownCity from './fixtures/own-city.json';
import { featureContext } from './helpers/feature-context';

function setup(prefs: Record<string, string> = {}) {
  const env = featureContext();
  for (const [key, value] of Object.entries(prefs)) env.ctx.ui.savePref(key, value);
  cityMapFeature.setup(env.ctx);
  const box = env.boxes.get('cityMap') as NonNullable<ReturnType<typeof env.boxes.get>>;
  return { ...env, box };
}

const loadOwnCity = (ctx: ReturnType<typeof setup>['ctx'], areas = true) => {
  for (const json of ownCity.defs) {
    const def = toBuildingDef(json);
    if (def) ctx.catalog.add(def);
  }
  const city = toCity(
    worldId('de20'),
    playerId(1),
    'ColonialAge',
    { entities: ownCity.entities as GameCityEntity[] },
    0,
  );
  // the recording has no unlocked areas; the bounding box of the buildings stands in for them
  ctx.cities.setOwn(areas ? { ...city, areas: [{ x: 8, y: 8, width: 36, length: 44 }] } : city);
};

const checkbox = (box: ReturnType<typeof setup>['box'], label: string) =>
  [...box.root.querySelectorAll('label')]
    .find((l) => l.textContent?.includes(label))
    ?.querySelector('input') as HTMLInputElement;

/** a 72 × 72 grid of 4 × 4 blocks, as the game sends it */
const grid = {
  width: 72,
  height: 72,
  blocks: Array.from({ length: 324 }, (_, i) => ({ x: (i % 18) * 4, y: Math.floor(i / 18) * 4 })),
};

const input = (box: ReturnType<typeof setup>['box']) =>
  box.root.querySelector('input[type=search]') as HTMLInputElement;

describe('city map feature', () => {
  it('opens from the menu and waits for the own city', () => {
    const { box, menu } = setup();
    menu('cityMap');
    expect(box.text).toContain('Die eigene Stadt ist noch nicht geladen.');
  });

  it('shows the own city with its free tiles', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx);
    menu('cityMap');
    // 36 × 44 tiles minus 1428 covered by buildings and streets
    expect(box.text).toContain(`${36 * 44 - 1428} freie Felder`);
    expect(box.root.querySelector('canvas')).not.toBeNull();
    expect(box.text).toContain('Wohnhaus');
    expect(box.text).not.toContain('Noch nicht alle Gebäudedaten');
  });

  it('tells when the free tiles are unknown', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx, false);
    menu('cityMap');
    expect(box.text).toContain('Freie Felder unbekannt');
  });

  it('marks nothing in the map while typing, keeps the field and keeps keys from the game', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx);
    menu('cityMap');
    const field = input(box);
    field.value = 'sakura';
    field.dispatchEvent(new Event('input'));
    expect(input(box)).toBe(field);
    // typing only suggests; the map stays as it is (Nutzer, 2026-10-26)
    expect(box.text).not.toContain('Treffer');
    let reached = false;
    document.addEventListener('keydown', () => {
      reached = true;
    });
    document.body.append(box.root);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(reached).toBe(false);
  });

  describe('the selection of the own city', () => {
    const search = (box: ReturnType<typeof setup>['box'], text: string) => {
      const field = input(box);
      field.value = text;
      field.dispatchEvent(new Event('input'));
    };
    const suggestions = (box: ReturnType<typeof setup>['box']) =>
      [...box.root.querySelectorAll('.suggestions li')].map((li) => li.querySelector('span')?.textContent);
    const pick = (box: ReturnType<typeof setup>['box'], name: string) => {
      const li = [...box.root.querySelectorAll('.suggestions li')].find(
        (l) => l.querySelector('span')?.textContent === name,
      );
      if (!li) throw new Error(`no suggestion "${name}"`);
      (li as HTMLElement).click();
    };
    const legend = (box: ReturnType<typeof setup>['box']) => box.root.querySelector('.map-legend')?.textContent ?? '';
    const shrine = 'Schrein des Wissens';
    const idsOf = (ctx: ReturnType<typeof setup>['ctx'], name: string) =>
      [...(ctx.cities.own()?.buildings.values() ?? [])]
        .filter((b) => ctx.catalog.get(b.def)?.name === name)
        .map((b) => b.id);

    /**
     * The pointer over the top left tile of building `id`, in the view from above the map opens with: `click` presses
     * there, `drag` presses `drag` pixels to the left and lets go there.
     */
    const pointAt = (
      env: ReturnType<typeof setup>,
      id: number,
      act: 'hover' | 'click' | 'shift' | number = 'click',
    ) => {
      const canvas = env.box.root.querySelector('canvas') as HTMLCanvasElement;
      Object.defineProperty(canvas, 'clientWidth', { value: 400, configurable: true });
      Object.defineProperty(canvas, 'clientHeight', { value: 300, configurable: true });
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;
      const city = env.ctx.cities.own() as City;
      const b = city.buildings.get(id) as Building;
      const fps = footprints(city.buildings.values(), (d) => env.ctx.catalog.get(d));
      const bounds = gridBounds([...(city.areas ?? []), ...fps]) as Bounds;
      const p = project('top', bounds, 400, 300, START_VIEW);
      const at = toScreen(p, b.x + 0.5, b.y + 0.5);
      const shiftKey = act === 'shift';
      const pointer = (type: string, x: number) =>
        canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: at.y, shiftKey, bubbles: true }));
      const drag = typeof act === 'number' ? act : 0;
      // the pointer comes over the building first, which shows its tooltip
      pointer('pointermove', at.x - drag);
      if (act === 'hover') return canvas.dataset.tip;
      pointer('pointerdown', at.x - drag);
      if (drag) pointer('pointermove', at.x);
      pointer('pointerup', at.x);
      return undefined;
    };
    const clickBuilding = (env: ReturnType<typeof setup>, id: number) => pointAt(env, id);
    const shiftClick = (env: ReturnType<typeof setup>, id: number) => pointAt(env, id, 'shift');
    const selected = (ctx: ReturnType<typeof setup>['ctx']) => [...ctx.selection.ids()].sort();
    const entries = (box: ReturnType<typeof setup>['box']) =>
      [...box.root.querySelectorAll('.selection-list li')].map((li) =>
        [...li.querySelectorAll('span')].map((x) => x.textContent).join(' '),
      );

    it('suggests only names of the own city, each with its count, and sets no arrows while typing', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      menu('cityMap');
      search(box, 'schrein');
      expect(suggestions(box)).toEqual([shrine, `${shrine} - St. 2`]);
      expect(box.root.querySelector('.suggestions')?.textContent).toContain('25');
      expect(marker.posted).toEqual([]);
      expect(ctx.selection.ids().size).toBe(0);
      search(box, 'Burg der Zwerge');
      expect(suggestions(box)).toEqual([]);
    });

    it('adds the buildings of a picked name and empties the field', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      menu('cityMap');
      search(box, 'schrein');
      pick(box, shrine);
      expect(input(box).value).toBe('');
      expect(marker.last).toMatchObject({ type: 'show' });
      expect(marker.shown.sort()).toEqual(idsOf(ctx, shrine).sort());
      const first = marker.last?.type === 'show' ? marker.last.spots[0] : undefined;
      expect(first && ctx.cities.own()?.buildings.get(first.id)?.x).toBe(first?.x);
      expect(legend(box)).toContain('Ausgewählt (Pfeil im Spiel)');
      expect(entries(box)).toEqual([`${shrine} 25/25`]);

      // typing again leaves the selection alone
      search(box, 'rathaus');
      expect(legend(box)).toContain('Ausgewählt (Pfeil im Spiel)');
      search(box, '');
      expect(marker.shown).toHaveLength(25);
    });

    it('picks with the keyboard', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      menu('cityMap');
      search(box, 'schrein');
      const key = (k: string) => input(box).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      key('ArrowDown');
      key('Enter');
      expect(input(box).value).toBe('');
      expect(marker.shown.sort()).toEqual(idsOf(ctx, `${shrine} - St. 2`).sort());
    });

    it('frames a selection from any source', () => {
      const { ctx, box, menu } = setup();
      loadOwnCity(ctx);
      menu('cityMap');
      expect(legend(box)).not.toContain('Ausgewählt');
      // as the building search does it
      ctx.selection.addName('Rathaus');
      expect(legend(box)).toContain('Ausgewählt (Pfeil im Spiel)');
      expect(entries(box)).toEqual(['Rathaus 1/1']);
      box.click('Alle entfernen');
      expect(legend(box)).not.toContain('Ausgewählt');
    });

    it('puts no arrows into a visited city and shows them when the own city returns', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      ctx.cities.setVisited({
        ...toCity(worldId('de20'), playerId(5), 'ColonialAge', { entities: [] }, 0),
        visit: { neighbor: true, friend: false, guildMember: false },
      });
      menu('cityMap');
      search(box, 'schrein');
      pick(box, shrine);
      expect(entries(box)).toEqual([`${shrine} 25/25`]);
      expect(marker.posted).toEqual([]);

      ctx.cities.showOwn();
      expect(marker.last).toMatchObject({ type: 'show' });
    });

    it('selects a clicked building alone, also out of several, and a click on the only one empties', () => {
      const env = setup();
      const { ctx, box, menu, marker } = env;
      loadOwnCity(ctx);
      menu('cityMap');
      search(box, 'schrein');
      pick(box, shrine);
      const [hall] = idsOf(ctx, 'Rathaus') as [number];
      const [shrineId] = idsOf(ctx, shrine) as [number];
      clickBuilding(env, hall);
      expect(selected(ctx)).toEqual([hall]);
      expect(marker.shown).toEqual([hall]);
      expect(pointAt(env, hall, 'hover')).toContain(
        'Klick: nur dieses auswählen, Umschalt+Klick: hinzufügen/entfernen',
      );

      // one of several selected: it stays alone
      ctx.selection.addName(shrine);
      clickBuilding(env, shrineId);
      expect(selected(ctx)).toEqual([shrineId]);

      clickBuilding(env, shrineId);
      expect(selected(ctx)).toEqual([]);
      expect(marker.last?.type).toBe('hide');
      expect(legend(box)).not.toContain('Ausgewählt');
    });

    it('adds a building with shift and a click, and removes a selected one so', () => {
      const env = setup();
      const { ctx, menu, marker } = env;
      loadOwnCity(ctx);
      menu('cityMap');
      const [hall] = idsOf(ctx, 'Rathaus') as [number];
      const [shrineId] = idsOf(ctx, shrine) as [number];
      shiftClick(env, hall);
      shiftClick(env, shrineId);
      expect(selected(ctx)).toEqual([hall, shrineId].sort());
      expect(marker.shown.sort()).toEqual([hall, shrineId].sort());
      shiftClick(env, hall);
      expect(selected(ctx)).toEqual([shrineId]);
      shiftClick(env, shrineId);
      expect(selected(ctx)).toEqual([]);
    });

    it('takes no drag of the map for a click', () => {
      const env = setup();
      const { ctx, box, menu, marker } = env;
      loadOwnCity(ctx);
      menu('cityMap');
      const [hall] = idsOf(ctx, 'Rathaus') as [number];
      pointAt(env, hall, 30);
      expect(marker.posted).toEqual([]);
      expect(selected(ctx)).toEqual([]);
      // the drag panned the map; back to the view the clicks are computed for
      box.click('Ganze Stadt');
      clickBuilding(env, hall);
      expect(selected(ctx)).toEqual([hall]);
    });

    it('lets go of the buildings whose arrows the viewer dismissed in the game', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      menu('cityMap');
      search(box, 'schrein');
      pick(box, `${shrine} - St. 2`);
      marker.dismiss(marker.shown);
      expect(legend(box)).not.toContain('Ausgewählt');
      expect(entries(box)).toEqual([]);
    });
  });
  it('switches the marks on and off', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx);
    menu('cityMap');
    expect(box.text).toContain('Produktion fertig');
    const finished = checkbox(box, 'Produktion fertig');
    finished.checked = false;
    finished.dispatchEvent(new Event('change'));
    expect(box.root.querySelector('.map-legend')?.textContent).not.toContain('Produktion fertig');
  });

  it('follows changes of the own city', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx);
    menu('cityMap');
    const before = box.updates.length;
    const house = ctx.cities.own()?.buildings.get(ownCity.entities[1]?.id as number) as Building;
    ctx.cities.updateBuildings([{ ...house, state: { kind: 'idle' }, def: buildingDefId(house.def) }]);
    expect(box.updates.length).toBeGreaterThan(before);
  });

  it('opens the statistics beside the map and remembers that', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx);
    menu('cityMap');
    expect(box.root.querySelector('.stats-panel')).toBeNull();
    expect(box.root.querySelector('.map-legend')?.textContent).toContain('Wohnhaus');
    box.click('Statistik');
    expect(ctx.ui.pref('cityMap.own.stats')).toBe('open');
    const panel = box.root.querySelector('.stats-panel')?.textContent ?? '';
    expect(panel).toContain(`${36 * 44 - 1428} von 1.584 Feldern frei`);
    expect(panel).toContain('Gebäude: 353');
    expect(panel).toContain('Wohnhaus');
    // the groups move from the legend into the panel
    expect(box.root.querySelector('.map-legend')?.textContent).not.toContain('Wohnhaus');
    box.click('Statistik');
    expect(ctx.ui.pref('cityMap.own.stats')).toBe('closed');
    expect(box.root.querySelector('.stats-panel')).toBeNull();
  });

  it('starts with the statistics open when the viewer left them open', () => {
    const { ctx, box, menu } = setup({ 'cityMap.own.stats': 'open' });
    loadOwnCity(ctx);
    menu('cityMap');
    expect(box.root.querySelector('.stats-panel')).not.toBeNull();
  });

  it('counts the expansions and draws the free expansion blocks on demand', () => {
    const { ctx, box, menu } = setup({ 'cityMap.own.stats': 'open' });
    ctx.catalog.setCityGrid(grid);
    ctx.resources.set({ money: 30e6, expansions: 2 });
    const city = toCity(worldId('de20'), playerId(1), 'IronAge', { entities: [] }, 0);
    ctx.cities.setOwn({
      ...city,
      // start area and one expansion to its right
      areas: [
        { x: 0, y: 0, width: 16, length: 16 },
        { x: 16, y: 0, width: 4, length: 4 },
      ],
      blocked: [{ x: 0, y: 16, width: 4, length: 4 }],
      expansions: [
        { kind: 'reward', cost: { money: 20e6, premium: 1500 } },
        { kind: 'reward', cost: { money: 45e6, premium: 3000 } },
        { kind: 'quantum', cost: { guild_raids_medals: 6e5 } },
      ],
    });
    menu('cityMap');
    const panel = () => box.root.querySelector('.stats-panel')?.textContent ?? '';
    expect(panel()).toContain('Gesetzt: 1');
    expect(panel()).not.toContain('Ungesetzt');
    expect(panel()).toContain('Belohnungs-Erweiterungen: 2 platzierbar, 2 offen');
    expect(panel()).toContain('Quanten-Erweiterungen: 0 von 1 kaufbar (nächste 0,6 Mio.)');
    // right of the start area 3 below the expansion, right of the expansion 1, below the start area 3 of 4
    expect(panel()).toContain('Jetzt setzbar: 7');
    expect(panel()).toContain(`Später: ${324 - 17 - 1 - 7}`);
    const toggle = checkbox(box, 'Erweiterungsflächen');
    expect(toggle.checked).toBe(false);
    expect(box.root.querySelector('.map-legend')?.textContent).not.toContain('Erweiterung jetzt setzbar');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(box.root.querySelector('.map-legend')?.textContent).toContain('Erweiterung jetzt setzbar');
  });

  it('tells where the open reward expansions come from, as soon as research data arrives', () => {
    const { ctx, box, menu } = setup({ 'cityMap.own.stats': 'open' });
    ctx.resources.set({ expansions: 0 });
    const city = toCity(worldId('de20'), playerId(1), 'SpaceAgeMars', { entities: [] }, 0);
    ctx.cities.setOwn({
      ...city,
      expansions: Array.from({ length: 23 }, () => ({ kind: 'reward' as const, cost: { money: 20e6 } })),
    });
    menu('cityMap');
    const line = () =>
      [...box.root.querySelectorAll('.stats-panel li')]
        .map((li) => li.textContent ?? '')
        .find((text) => text.startsWith('Belohnungs-Erweiterungen'));
    expect(line()).toBe('Belohnungs-Erweiterungen: 0 platzierbar, 23 offen');
    // the reference city: 14 main expansions left in research, the first with "Mars-Vorschriften"
    const tree = toResearchExpansions([
      { id: 'wheel', name: 'Das Rad', rewards: [{ type: 'expansion', subType: 'main', amount: 1 }] },
      {
        id: 'outpost',
        name: 'Außenposten',
        rewards: [{ type: 'era_outpost_expansion', subType: 'era_outpost', amount: 3 }],
      },
      { id: 'mars_rules', name: 'Mars-Vorschriften', rewards: [{ type: 'expansion', subType: 'main', amount: 2 }] },
      { id: 'mars_late', name: 'Mars-Spät', rewards: [{ type: 'expansion', subType: 'main', amount: 12 }] },
    ]);
    ctx.research.setExpansions(tree);
    expect(line()).toBe('Belohnungs-Erweiterungen: 0 platzierbar, 23 offen');
    ctx.research.setUnlocked(['root', 'wheel', 'outpost']);
    expect(line()).toBe(
      'Belohnungs-Erweiterungen: 0 platzierbar, 23 offen (14 aus Forschung, nächste: Mars-Vorschriften; 9 von der Kontinentkarte)',
    );
    ctx.research.setUnlocked(['root', 'wheel', 'mars_rules', 'mars_late']);
    expect(line()).toBe(
      'Belohnungs-Erweiterungen: 0 platzierbar, 23 offen (0 aus Forschung; 23 von der Kontinentkarte)',
    );
  });
});
