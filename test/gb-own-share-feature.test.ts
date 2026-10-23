// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { createGbOwnShareFeature } from '../src/content/features/gb-own-share';
import { registerGameHandlers } from '../src/content/game/handlers';
import fixture from './fixtures/great-buildings.json';
import { featureContext } from './helpers/feature-context';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const arc = fixture.startup[0]?.responseData.city_map.entities[0] as Record<string, unknown> & {
  state: Record<string, unknown>;
};
type Row = (typeof fixture.own.responseData.rankings)[number];

function setup() {
  const env = featureContext();
  const { ctx } = env;
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...ctx, now: Date.now });
  const copies: string[] = [];
  createGbCalculatorFeature(() => {}).setup(ctx);
  createGbOwnShareFeature(async (text) => {
    copies.push(text);
  }).setup(ctx);
  const box = env.boxes.get('gbOwnShare') as NonNullable<ReturnType<typeof env.boxes.get>>;
  const send = (...entries: Entry[]) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: JSON.stringify(
        entries.map(({ requestClass, requestMethod, requestData }) => ({ requestClass, requestMethod, requestData })),
      ),
      response: JSON.stringify(
        entries.map(({ requestClass, requestMethod, responseData }) => ({ requestClass, requestMethod, responseData })),
      ),
      at: 0,
    });
  send(...(fixture.startup as Entry[]));
  /** opens the own Arc, its rankings changed by `rows` */
  const openOwn = (rows: (r: Row[]) => Row[] = (r) => r) =>
    send({
      ...fixture.own,
      responseData: { ...fixture.own.responseData, rankings: rows(fixture.own.responseData.rankings) },
    } as Entry);
  const updateArc = (state: Record<string, unknown>, change: Record<string, unknown> = {}) =>
    send({
      requestClass: 'CityMapService',
      requestMethod: 'updateEntity',
      requestData: [],
      responseData: [{ ...arc, ...change, state: { ...arc.state, ...state } }],
    });
  const rows = () =>
    [...box.root.querySelectorAll('tr')].slice(1).map((tr) =>
      [...tr.querySelectorAll('td')]
        .map((td) => td.textContent?.trim())
        .join(' ')
        .trim(),
    );
  /** ticks or unticks the checkbox or radio whose label holds `text` */
  const check = (text: string, on = true) => {
    const label = [...box.root.querySelectorAll('label')].find((l) => l.textContent?.includes(text));
    const input = label?.querySelector('input') as HTMLInputElement;
    input.checked = on;
    input.dispatchEvent(new Event('change'));
  };
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('change'));
  };
  const copyField = () => box.root.querySelector('.copy-text') as HTMLInputElement;
  return { ...env, box, send, openOwn, updateArc, rows, copies, check, type, copyField };
}

/** the recorded Arc as if nobody but the owner had paid in: 5.132 of 21.777 */
const onlyOwner = (rows: Row[]) =>
  rows.map((r) => {
    if (!('rank' in r)) return r;
    const { forge_points: _, ...rest } = r as Row & { forge_points?: number };
    return { ...rest, player: { name: 'Noch kein Mäzen', avatar: '', __class__: 'OtherPlayer' } } as Row;
  });

describe('Eigenanteil', () => {
  it('opens with an own great building and shows each place with its payment and advance', async () => {
    const { box, openOwn, rows, ctx } = setup();
    openOwn();
    await tick();
    expect(box.box.isOpen).toBe(true);
    expect(box.text).toContain('135 → 136');
    // the top places hold 10 and 3 FP: safe only once the owner fills almost all of the level
    // own Forge points stand before the place they make safe, with the running total of the own share
    // helpers take P1 and P2 from the placeholders with 10 and 3, which end up below the paid places
    expect(rows()).toEqual([
      // what is paid and what to pay before place 1 share the first row
      'Eigene FP 6.742 (=11.874) 5.132',
      'P1 frei 4.950 – –',
      'P2 frei 2.480 – –',
      'Eigene FP 816 (=12.690) –',
      'P3 frei 827 – –',
      'Eigene FP 409 (=13.099) –',
      'P4 frei 209 – –',
      'Eigene FP 133 (=13.232) –',
      'P5 frei 38 – –',
      '#6-7 – 13',
      'Eigene FP 28 (=13.260) –',
    ]);
    expect(box.text).toContain('Eigenanteil: 13.260 FP');
    expect(box.text).toContain('eingezahlt 5.132');
    expect(box.text).toContain('offen 8.128');
    // the LG-Rechner stays closed for an own building
    expect(ctx.greatBuildings.current()?.own).toBe(true);
  });

  it('asks the factor of the own setting from its own buttons', async () => {
    const { box, openOwn, rows, ctx } = setup();
    openOwn(onlyOwner);
    await tick();
    // 16.645 missing; P1 asks 2.605 × 1,9 = 4.950 and needs 6.745 of the owner first
    expect(rows().slice(0, 2)).toEqual(['Eigene FP 6.745 (=11.877) 5.132', 'P1 frei 4.950 – –']);
    box.click('2');
    await tick();
    expect(ctx.settings.number('gbOwn.factor')).toBe(100);
    expect(rows()[1]).toBe('P1 frei 5.210 – –');
    await ctx.settings.set('gbOwn.factorButtons', [90, 120]);
    await tick();
    const buttons = [...box.root.querySelectorAll('.gb-factor button')].map((b) => b.textContent?.trim());
    // the own Arc bonus of 95,5 % sorts in by its value
    expect(buttons).toEqual(['1,9', '1,955', '2,2']);
    box.click('2,2');
    await tick();
    expect(ctx.settings.number('gbOwn.factor')).toBe(120);
    box.click('1,955');
    await tick();
    expect(ctx.settings.get('gbOwn.factorArc')).toBe(true);
    // 2.605 × 1,955 = 5.092,8
    expect(rows()[1]).toBe('P1 frei 5.093 – –');
    expect(box.root.querySelector('.gb-factor button.active')?.textContent?.trim()).toBe('1,955');
    await ctx.settings.set('gbOwn.arcButton', false);
    await tick();
    expect([...box.root.querySelectorAll('.gb-factor button')].map((b) => b.textContent?.trim())).toEqual([
      '1,9',
      '2,2',
    ]);
  });

  it('copies the safe places by default and what the settings ask for', async () => {
    const { box, openOwn, copies, type, copyField, ctx } = setup();
    openOwn(onlyOwner);
    await tick();
    // place 1 needs own Forge points first, so no place is safe to hand out yet
    expect(copyField().value).toBe('Ich X_FutureEra_Landmark1 Kein Platz sicher');
    await ctx.settings.set('gbOwn.copy.mode', 'autoUnsafe');
    await tick();
    expect(copyField().value).toBe('Ich X_FutureEra_Landmark1 P5(38) P4(209) P3(827) P2(2480) P1(4950)');
    await ctx.settings.set('gbOwn.copy.descending', false);
    await ctx.settings.set('gbOwn.copy.level', true);
    await ctx.settings.set('gbOwn.copy.ownPart', true);
    await ctx.settings.set('gbOwn.copy.prefixP', false);
    await tick();
    expect(copyField().value).toBe('Ich X_FutureEra_Landmark1 135→136 1(4950) 2(2480) 3(827) 4(209) 5(38) EA(8141)');
    // the player name is a setting, the building name stays in the box, kept per building
    await ctx.settings.set('gbOwn.copy.playerName', 'Michi');
    type(box.root.querySelector('.copy-building') as HTMLInputElement, 'Arche');
    await ctx.settings.set('gbOwn.copy.mode', 'manual');
    await ctx.settings.set('gbOwn.copy.manual', [2]);
    await tick();
    expect(copyField().value).toBe('Michi Arche 135→136 2(2480) EA(8141)');
    expect(box.root.querySelector('details')).toBeNull();
    // the field can still be edited before copying
    copyField().value = 'Arche P2 bitte';
    box.click('Kopieren');
    await tick();
    expect(copies).toEqual(['Arche P2 bitte']);
    expect(box.text).toContain('Kopiert ✓');
  });

  it('copies a number to pay with a click', async () => {
    const { box, openOwn, copies } = setup();
    openOwn();
    await tick();
    (box.root.querySelector('button.copy-fp') as HTMLButtonElement).click();
    await tick();
    expect(copies).toEqual(['6742']);
  });

  it('counts a promised payment, secures only deposits that keep their place, and trusts when told', async () => {
    const { box, openOwn, rows, check, type } = setup();
    openOwn();
    await tick();
    type(box.root.querySelectorAll('input.ext')[2] as HTMLInputElement, '3000');
    await tick();
    // 3.000 promised are less than P1's 4.950 but keep P2 against its 2.480; the placeholders go below
    expect(rows().filter((r) => /^[P#]/.test(r))).toEqual([
      'P1 frei 4.950 – –',
      // promised 3.000 against 2.480 at the factor: 520 more
      'P2 zugesagt – 3.000 +520',
      'P3 frei 827 – –',
      'P4 frei 209 – –',
      'P5 frei 38 – –',
      '#6-7 – 13',
    ]);
    type(box.root.querySelectorAll('input.ext')[1] as HTMLInputElement, '');
    type(box.root.querySelectorAll('input.ext')[2] as HTMLInputElement, '');
    await tick();
    // placeholders keep no place, so there is nothing to secure
    const before = rows();
    check('Absichern', false);
    await tick();
    expect(rows()).toEqual(before);
    check('Vertrauen');
    await tick();
    // trusted, the 10 pushed down do not count against P1: 16.632 - 2 × 4.950
    expect(rows()[0]).toBe('Eigene FP 6.732 (=11.864) 5.132');
  });

  it('shows how much a holder who keeps the place paid more or less than the factor asks', async () => {
    const { box, openOwn, rows, type } = setup();
    openOwn();
    await tick();
    // 15.600 and 1.000 promised leave 32 missing: 1.000 keep P2 although the factor asks 2.480
    type(box.root.querySelectorAll('input.ext')[0] as HTMLInputElement, '15600');
    type(box.root.querySelectorAll('input.ext')[1] as HTMLInputElement, '1000');
    await tick();
    expect(rows().filter((r) => /^P[12]/.test(r))).toEqual([
      'P1 zugesagt – 15.600 +10.650',
      'P2 zugesagt – 1.000 -1.480',
    ]);
    const cell = box.root.querySelectorAll('tr')[3]?.querySelectorAll('td')[4];
    expect(cell?.className).toBe('num short');
    expect(cell?.getAttribute('data-tip')).toBe('eingezahlt 1.000 · nach Faktor 2.480');
  });

  it('stays closed for an own great building when it should not open by itself', async () => {
    const { box, openOwn, ctx } = setup();
    await ctx.settings.set('gbOwn.autoOpen', false);
    openOwn();
    await tick();
    expect(box.box.isOpen).toBe(false);
  });

  it('counts Forge points others pay in live and asks to reopen after a level up', async () => {
    const { box, openOwn, updateArc } = setup();
    openOwn();
    await tick();
    updateArc({ invested_forge_points: 5200 });
    await tick();
    expect(box.text).toContain('Seit dem Öffnen +55 FP von anderen');
    updateArc({ invested_forge_points: 0, forge_points_for_level_up: 22000 }, { level: 136 });
    await tick();
    expect(box.text).toContain('Das LG ist auf Stufe 136 gelevelt. Bitte neu öffnen.');
  });

  it('does not count an own contribution as Forge points of others', async () => {
    const { box, openOwn, send } = setup();
    openOwn();
    await tick();
    // as recorded on de10 2026-10-23: the new rankings with the own row grown, and the building in a
    // CityMapService.updateEntity and a reset of the same response
    const rankings = fixture.own.responseData.rankings.map((r) =>
      'rank' in r ? r : { ...r, forge_points: (r as { forge_points: number }).forge_points + 1 },
    );
    send(
      {
        requestClass: 'GreatBuildingsService',
        requestMethod: 'contributeForgePoints',
        requestData: [1769, 1000, 135, 1, false],
        responseData: rankings,
      },
      {
        requestClass: 'CityMapService',
        requestMethod: 'updateEntity',
        requestData: [],
        responseData: [{ ...arc, state: { ...arc.state, invested_forge_points: 5146 } }],
      },
      {
        requestClass: 'CityMapService',
        requestMethod: 'reset',
        requestData: [],
        responseData: [{ ...arc, state: { ...arc.state, invested_forge_points: 5146 } }],
      },
    );
    await tick();
    expect(box.text).toContain('eingezahlt 5.133');
    expect(box.text).not.toContain('Seit dem Öffnen');
  });

  it('opens from the menu with a hint before any own great building', () => {
    const { box, menu } = setup();
    menu('gbOwnShare');
    expect(box.text).toContain('Noch kein eigenes LG geöffnet.');
  });
});
