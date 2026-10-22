// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import { CityMap, type CityMapData, legendView, START_VIEW } from '../src/content/ui/city-map';
import { project, toScreen } from '../src/content/ui/map-projection';

const data: CityMapData = {
  areas: [{ x: 0, y: 0, width: 10, length: 10 }],
  tiles: [
    { x: 0, y: 0, width: 3, length: 2, fill: '#f00', tooltip: 'Rathaus' },
    { x: 5, y: 5, width: 1, length: 1, fill: '#888', tooltip: 'Straße' },
  ],
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A drawn map with a canvas of 200 × 100 pixels at the top left of the page. */
function mount(map = new CityMap()) {
  const root = document.createElement('div');
  document.body.append(root);
  const draw = () => render(map.render(data, legendView([{ color: '#f00', label: 'Rot' }])), root);
  draw();
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  Object.defineProperty(canvas, 'clientWidth', { value: 200 });
  Object.defineProperty(canvas, 'clientHeight', { value: 100 });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
  const tip = root.querySelector('.map-tip') as HTMLElement;
  const move = (x: number, y: number) =>
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  const button = (label: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
  return { root, map, canvas, tip, move, button, draw };
}

describe('city map', () => {
  it('shows the tooltip of the building under the pointer from above', () => {
    const { tip, move } = mount();
    const p = project('top', { x1: 0, y1: 0, x2: 9, y2: 9 }, 200, 100, START_VIEW);
    const inHall = toScreen(p, 1.5, 1);
    move(inHall.x, inHall.y);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Rathaus');
    const empty = toScreen(p, 8.5, 8.5);
    move(empty.x, empty.y);
    expect(tip.hidden).toBe(true);
  });

  it('switches to the isometric view and finds buildings there', () => {
    const onMode = vi.fn();
    const { tip, move, button, map } = mount(new CityMap({ onMode }));
    expect(button('Draufsicht').classList.contains('active')).toBe(true);
    button('Isometrisch').click();
    expect(onMode).toHaveBeenCalledWith('iso');
    expect(map.mode).toBe('iso');
    expect(button('Isometrisch').classList.contains('active')).toBe(true);
    const p = project('iso', { x1: 0, y1: 0, x2: 9, y2: 9 }, 200, 100, START_VIEW);
    const onStreet = toScreen(p, 5.5, 5.5);
    move(onStreet.x, onStreet.y);
    expect(tip.textContent).toBe('Straße');
  });

  it('starts in the mode it is given', () => {
    const { button } = mount(new CityMap({ mode: 'iso' }));
    expect(button('Isometrisch').classList.contains('active')).toBe(true);
  });

  it('draws without a canvas context and shows the legend', async () => {
    const { root, draw } = mount();
    draw();
    await tick();
    expect(root.querySelector('.map-legend')?.textContent).toContain('Rot');
  });

  it('widens the map to its zones and shows their tooltip where no building stands', () => {
    const map = new CityMap();
    const { move, tip, root } = mount(map);
    const zoned: CityMapData = {
      ...data,
      zones: [{ rects: [{ x: 12, y: 0, width: 4, length: 4 }], fill: '#0f0', tooltip: 'Erweiterungsfläche' }],
    };
    render(map.render(zoned), root);
    // the bounds now reach x 15, so the zone lies inside the canvas
    const p = project('top', { x1: 0, y1: 0, x2: 15, y2: 9 }, 200, 100, START_VIEW);
    const inZone = toScreen(p, 14, 2);
    move(inZone.x, inZone.y);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Erweiterungsfläche');
    const inHall = toScreen(p, 1.5, 1);
    move(inHall.x, inHall.y);
    expect(tip.textContent).toBe('Rathaus');
  });

  it('keeps the wheel away from the box and the game', () => {
    const { canvas } = mount();
    const outside = vi.fn();
    document.addEventListener('wheel', outside);
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(outside).not.toHaveBeenCalled();
    document.removeEventListener('wheel', outside);
  });

  it.each(['top', 'iso'] as const)('centers a building it is asked to focus (%s)', (mode) => {
    const { map } = mount(new CityMap({ mode }));
    expect(map.tileIndexAt(100, 50)).not.toBe(0);
    map.focus(data.tiles[0] as CityMapData['tiles'][number]);
    expect(map.tileIndexAt(100, 50)).toBe(0);
  });

  it.each(['top', 'iso'] as const)(
    'keeps the focus when the data it was asked for arrives after it, with other bounds (%s)',
    async (mode) => {
      // a closed box keeps the last city; the row of a city visited since then focuses before the new city renders
      const { map, root } = mount(new CityMap({ mode }));
      const next: CityMapData = {
        areas: [{ x: 0, y: 0, width: 40, length: 30 }],
        tiles: [{ x: 30, y: 20, width: 2, length: 2, fill: '#f00', tooltip: 'Münzhaus' }],
      };
      map.focus(next.tiles[0] as CityMapData['tiles'][number]);
      render(map.render(next), root);
      await tick();
      expect(map.tileIndexAt(100, 50)).toBe(0);
    },
  );

  it('focuses once the canvas has a size when asked before', () => {
    const map = new CityMap();
    const root = document.createElement('div');
    document.body.append(root);
    render(map.render(data), root);
    map.focus({ x: 0, y: 0, width: 3, length: 2 });
    const canvas = root.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'clientWidth', { value: 200 });
    Object.defineProperty(canvas, 'clientHeight', { value: 100 });
    // what the size observer does once the box is laid out
    map.draw();
    expect(map.tileIndexAt(100, 50)).toBe(0);
  });
});

describe('city map in another window', () => {
  it('watches its size with the observer of the window it was moved to and redraws on a resize there', async () => {
    const { Window } = await import('happy-dom');
    const popup = new Window() as unknown as globalThis.Window & { ResizeObserver: unknown };
    const observed: { target: Element; redraw: () => void }[] = [];
    popup.ResizeObserver = class {
      constructor(private redraw: () => void) {}
      observe(target: Element) {
        observed.push({ target, redraw: this.redraw });
      }
      disconnect() {}
    };
    const { map, canvas, root } = mount();
    popup.document.body.append(root);
    map.draw();
    expect(observed.map((o) => o.target)).toEqual([canvas]);
    const draw = vi.spyOn(map, 'draw');
    observed[0]?.redraw();
    expect(draw).toHaveBeenCalled();
  });
});
