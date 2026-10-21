// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { cityMapFeature } from '../src/content/features/city-map/index';
import { toBuildingDef } from '../src/content/game/building-defs';
import { toCity } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import type { Building } from '../src/content/stores/city-model';
import { buildingDefId, playerId, worldId } from '../src/shared/ids';
import ownCity from './fixtures/own-city.json';
import { featureContext } from './helpers/feature-context';

function setup() {
  const env = featureContext();
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

  it('switches the marks on and off', () => {
    const { ctx, box, menu } = setup();
    loadOwnCity(ctx);
    menu('cityMap');
    expect(box.text).toContain('Produktion fertig');
    const checkbox = [...box.root.querySelectorAll('label')]
      .find((l) => l.textContent?.includes('Produktion fertig'))
      ?.querySelector('input') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
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
});
