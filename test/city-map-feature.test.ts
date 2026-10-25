// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { cityMapFeature } from '../src/content/features/city-map/index';
import { toBuildingDef } from '../src/content/game/building-defs';
import { toCity, toResearchExpansions } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import type { Building } from '../src/content/stores/city-model';
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

  it('counts search hits while typing, keeps the field and keeps keys from the game', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx);
    menu('cityMap');
    const field = input(box);
    field.value = 'sakura';
    field.dispatchEvent(new Event('input'));
    expect(input(box)).toBe(field);
    expect(box.text).toMatch(/\d+ Treffer/);
    expect(box.text).toContain('Suchtreffer');
    let reached = false;
    document.addEventListener('keydown', () => {
      reached = true;
    });
    document.body.append(box.root);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(reached).toBe(false);
  });

  describe('arrows in the game', () => {
    const search = (box: ReturnType<typeof setup>['box'], text: string) => {
      const field = input(box);
      field.value = text;
      field.dispatchEvent(new Event('input'));
    };

    it('marks the search hits in the game and removes the arrows with an empty search', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      menu('cityMap');
      search(box, 'sakura');
      const count = Number(box.text.match(/(\d+) Treffer/)?.[1]);
      expect(count).toBeGreaterThan(0);
      expect(marker.last).toMatchObject({ type: 'show', settle: false });
      expect(marker.shown).toHaveLength(count);
      expect(ctx.markers.current()).toMatchObject({ by: 'cityMap', city: 'own' });
      const first = marker.last?.type === 'show' ? marker.last.spots[0] : undefined;
      expect(first && ctx.cities.own()?.buildings.get(first.id)?.x).toBe(first?.x);

      search(box, 'kein Gebäude heißt so');
      expect(marker.last?.type).toBe('hide');
      search(box, 'sakura');
      search(box, '  ');
      expect(marker.last?.type).toBe('hide');
      expect(ctx.markers.current()).toBeUndefined();
      // the hits stay highlighted in the box only while searching
      expect(box.text).not.toContain('Suchtreffer');
    });

    it('puts no arrows into a visited city and shows them when the own city returns', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      ctx.cities.setVisited({
        ...toCity(worldId('de20'), playerId(5), 'ColonialAge', { entities: [] }, 0),
        visit: { neighbor: true, friend: false, guildMember: false },
      });
      menu('cityMap');
      search(box, 'sakura');
      expect(box.text).toMatch(/\d+ Treffer/);
      expect(marker.posted).toEqual([]);

      ctx.cities.showOwn();
      expect(marker.last).toMatchObject({ type: 'show', settle: true });
    });

    it('leaves arrows another feature set alone when the search empties', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      menu('cityMap');
      ctx.markers.set('sabotage', 'own', [{ id: 1, x: 0, y: 0, width: 1, length: 1 }]);
      search(box, '');
      expect(marker.last?.type).toBe('show');
      expect(ctx.markers.current()?.by).toBe('sabotage');
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
        { kind: 'tileset_reward', cost: { money: 20e6, premium: 1500 } },
        { kind: 'tileset_reward', cost: { money: 45e6, premium: 3000 } },
        { kind: 'raidMedals', cost: { guild_raids_medals: 6e5 } },
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
      expansions: Array.from({ length: 23 }, () => ({ kind: 'tileset_reward', cost: { money: 20e6 } })),
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
