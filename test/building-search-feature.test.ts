// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { buildingSearchFeature } from '../src/content/features/building-search/index';
import { cityMapFeature } from '../src/content/features/city-map/index';
import { toBuildingDef } from '../src/content/game/building-defs';
import { toCity } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import { playerId, worldId } from '../src/shared/ids';
import ownCity from './fixtures/own-city.json';
import { featureContext } from './helpers/feature-context';

type Env = ReturnType<typeof featureContext>;
type Recorded = NonNullable<ReturnType<Env['boxes']['get']>>;

function setup({ withCityMap = false } = {}) {
  const env = featureContext();
  buildingSearchFeature.setup(env.ctx);
  if (withCityMap) cityMapFeature.setup(env.ctx);
  const box = env.boxes.get('buildingSearch') as Recorded;
  return { ...env, box };
}

const loadOwnCity = (ctx: Env['ctx']) => {
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
  ctx.cities.setOwn({ ...city, areas: [{ x: 8, y: 8, width: 36, length: 44 }] });
};

const input = (box: Recorded) => box.root.querySelector('input[type=search]') as HTMLInputElement;
const type = (box: Recorded, text: string) => {
  const field = input(box);
  field.value = text;
  field.dispatchEvent(new Event('input'));
};
const key = (box: Recorded, k: string) =>
  input(box).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const suggestions = (box: Recorded) =>
  [...box.root.querySelectorAll('.suggestions li')].map((li) =>
    [...li.querySelectorAll('span')].map((s) => s.textContent).join(' '),
  );
const pick = (box: Recorded, name: string) => {
  const li = [...box.root.querySelectorAll('.suggestions li')].find(
    (l) => l.querySelector('span')?.textContent === name,
  );
  if (!li) throw new Error(`no suggestion "${name}"`);
  (li as HTMLElement).click();
};
const idsOf = (ctx: Env['ctx'], name: string) =>
  [...(ctx.cities.own()?.buildings.values() ?? [])]
    .filter((b) => ctx.catalog.get(b.def)?.name === name)
    .map((b) => b.id)
    .sort();

const shrine = 'Schrein des Wissens';

describe('building search feature', () => {
  it('opens from the menu as a box without resize handle and waits for the own city', () => {
    const { box, menu } = setup();
    expect(box.options.resizable).toBeUndefined();
    menu('buildingSearch');
    expect(box.title).toBe('Gebäudesuche');
    expect(box.text).toContain('Die eigene Stadt ist noch nicht geladen.');
  });

  it('suggests only names of buildings in the own city with their count and sets no arrows while typing', () => {
    const { ctx, box, menu, marker } = setup();
    loadOwnCity(ctx);
    menu('buildingSearch');
    type(box, 'SCHREIN');
    expect(suggestions(box)).toEqual([`${shrine} 25`, `${shrine} - St. 2 6`]);
    type(box, 'rathaus');
    expect(suggestions(box)).toEqual(['Rathaus 1']);
    // buildings beside the grid have no place to point at
    type(box, 'Hafen');
    expect(suggestions(box)).toEqual([]);
    expect(marker.posted).toEqual([]);
    expect(box.text).toContain('Einen Vorschlag wählen');
  });

  it('marks all buildings of a picked name, by click or keyboard, and keeps the name in the field', () => {
    const { ctx, box, menu, marker } = setup();
    loadOwnCity(ctx);
    menu('buildingSearch');
    type(box, 'schrein');
    pick(box, shrine);
    expect(input(box).value).toBe(shrine);
    expect(marker.shown.sort()).toEqual(idsOf(ctx, shrine));
    expect(ctx.markers.current()).toMatchObject({ by: 'buildingSearch', city: 'own' });
    expect(box.text).toContain('25 im Spiel markiert');

    type(box, 'schrein');
    key(box, 'ArrowDown');
    key(box, 'Enter');
    expect(input(box).value).toBe(`${shrine} - St. 2`);
    expect(marker.shown.sort()).toEqual(idsOf(ctx, `${shrine} - St. 2`));
    expect(box.text).toContain('6 im Spiel markiert');
  });

  it('takes its arrows away when the field is emptied', () => {
    const { ctx, box, menu, marker } = setup();
    loadOwnCity(ctx);
    menu('buildingSearch');
    type(box, 'rathaus');
    pick(box, 'Rathaus');
    type(box, '');
    expect(marker.last?.type).toBe('hide');
    expect(ctx.markers.current()).toBeUndefined();
    expect(box.text).toContain('Einen Vorschlag wählen');
  });

  it('follows the own city and the building definitions as they arrive', () => {
    vi.useFakeTimers();
    try {
      const { ctx, box, menu } = setup();
      menu('buildingSearch');
      const city = toCity(
        worldId('de20'),
        playerId(1),
        'ColonialAge',
        { entities: ownCity.entities as GameCityEntity[] },
        0,
      );
      ctx.cities.setOwn(city);
      expect(input(box)).not.toBeNull();
      type(box, 'schrein');
      expect(suggestions(box)).toEqual([]);
      for (const json of ownCity.defs) {
        const def = toBuildingDef(json);
        if (def) ctx.catalog.add(def);
      }
      vi.runAllTimers();
      expect(suggestions(box)).toEqual([`${shrine} 25`, `${shrine} - St. 2 6`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps keys from the game', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx);
    menu('buildingSearch');
    document.body.append(box.root);
    let reached = false;
    const listener = () => {
      reached = true;
    };
    document.addEventListener('keydown', listener);
    key(box, 'w');
    key(box, 'Enter');
    document.removeEventListener('keydown', listener);
    expect(reached).toBe(false);
  });

  describe('one marking of the own city', () => {
    const mapInput = (env: Env) =>
      (env.boxes.get('cityMap') as Recorded).root.querySelector('input') as HTMLInputElement;

    it('gives way to a pick in the city map and keeps its text without claiming arrows', () => {
      const env = setup({ withCityMap: true });
      const { ctx, box, menu, marker } = env;
      loadOwnCity(ctx);
      menu('buildingSearch');
      menu('cityMap');
      type(box, 'schrein');
      pick(box, shrine);
      const map = env.boxes.get('cityMap') as Recorded;
      type(map, 'rathaus');
      pick(map, 'Rathaus');
      expect(marker.shown).toEqual(idsOf(ctx, 'Rathaus'));
      expect(input(box).value).toBe(shrine);
      expect(box.text).not.toContain('im Spiel markiert');
      expect(box.text).toContain('Einen Vorschlag wählen');

      // emptying the field of the building search leaves the arrows of the city map alone
      type(box, '');
      expect(ctx.markers.current()?.by).toBe('cityMap');
      expect(marker.shown).toEqual(idsOf(ctx, 'Rathaus'));
      expect(mapInput(env).value).toBe('Rathaus');

      // a new pick here takes the marking back
      type(box, 'schrein');
      pick(box, shrine);
      expect(marker.shown.sort()).toEqual(idsOf(ctx, shrine));
      expect(map.root.querySelector('.map-legend')?.textContent).not.toContain('Pfeil im Spiel');
    });

    it('forgets its arrows when the viewer dismisses them in the game', () => {
      const { ctx, box, menu, marker } = setup();
      loadOwnCity(ctx);
      menu('buildingSearch');
      type(box, 'rathaus');
      pick(box, 'Rathaus');
      marker.dismiss(marker.shown);
      expect(box.text).not.toContain('im Spiel markiert');
      expect(input(box).value).toBe('Rathaus');
    });
  });
});
