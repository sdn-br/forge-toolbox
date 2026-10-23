// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { createGbOwnShareFeature } from '../src/content/features/gb-own-share';
import { registerGameHandlers } from '../src/content/game/handlers';
import definitions from './fixtures/gb-definitions.json';
import levelUp from './fixtures/gb-own-level-up.json';
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

function setup(startup = fixture.startup as Entry[]) {
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
  send(...startup);
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
        .filter(Boolean)
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
  const loadDefinitions = () => {
    for (const f of definitions.files)
      ingestion.accept({ kind: 'meta', url: f.url, response: JSON.stringify(f.json), at: 0 });
  };
  const sendWs = (...entries: Entry[]) =>
    ingestion.accept({
      kind: 'ws',
      data: JSON.stringify(
        entries.map(({ requestClass, requestMethod, responseData }) => ({ requestClass, requestMethod, responseData })),
      ),
      at: 0,
    });
  return { ...env, box, send, sendWs, openOwn, updateArc, rows, copies, check, type, copyField, loadDefinitions };
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
      'P1 4.950 – –',
      'P2 2.480 – –',
      'Eigene FP 816 (=12.690) –',
      'P3 827 – –',
      'Eigene FP 409 (=13.099) –',
      'P4 209 – –',
      'Eigene FP 133 (=13.232) –',
      'P5 38 – –',
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
    expect(rows().slice(0, 2)).toEqual(['Eigene FP 6.745 (=11.877) 5.132', 'P1 4.950 – –']);
    box.click('2');
    await tick();
    // the buttons change the building in the box, not the setting
    expect(ctx.settings.number('gbOwn.factor')).toBe(90);
    expect(rows()[1]).toBe('P1 5.210 – –');
    await ctx.settings.set('gbOwn.factorButtons', [90, 120]);
    await tick();
    const buttons = [...box.root.querySelectorAll('.gb-factor button:not(.icon)')].map((b) => b.textContent?.trim());
    // the own Arc bonus of 95,5 % sorts in by its value
    expect(buttons).toEqual(['1,9', '1,955', '2,2']);
    box.click('2,2');
    await tick();
    expect(rows()[1]).toBe('P1 5.731 – –');
    box.click('1,955');
    await tick();
    // 2.605 × 1,955 = 5.092,8
    expect(rows()[1]).toBe('P1 5.093 – –');
    expect(box.root.querySelector('.gb-factor button.active')?.textContent?.trim()).toBe('1,955');
    await ctx.settings.set('gbOwn.arcButton', false);
    await tick();
    expect([...box.root.querySelectorAll('.gb-factor button:not(.icon)')].map((b) => b.textContent?.trim())).toEqual([
      '1,9',
      '2,2',
    ]);
  });

  it('keeps a factor per place: changed, saved for the building, or the standard', async () => {
    const { box, openOwn, rows, type, copyField, ctx } = setup();
    openOwn(onlyOwner);
    await tick();
    const fields = () => [...box.root.querySelectorAll('input.place-factor')] as HTMLInputElement[];
    // the status is an icon with its words as tooltip
    const status = () => box.root.querySelector('.factor-status')?.getAttribute('data-tip');
    // all three show, the ones that would do nothing greyed
    const icons = () =>
      [...box.root.querySelectorAll('.gb-factor button.icon:not(.off)')].map((b) => b.getAttribute('aria-label'));
    const active = () =>
      [...box.root.querySelectorAll('.gb-factor .active')].map((b) => b.textContent?.trim() || 'field');
    const SAVE = 'Für dieses LG speichern';
    const RESET = 'Auf Standard zurücksetzen';
    const ADOPT = 'Als Standard übernehmen';
    const iconClick = (tip: string) =>
      (box.root.querySelector(`.gb-factor button.icon[aria-label="${tip}"]`) as HTMLButtonElement).click();
    // a field per place, none in the rows of own Forge points
    expect(fields().map((f) => f.value)).toEqual(['1.9', '1.9', '1.9', '1.9', '1.9']);
    expect(status()).toBe('Standard-Faktoren');
    expect(icons()).toEqual([]);
    // greyed, not gone: the bar keeps its width and the tooltip says why
    expect([...box.root.querySelectorAll('.gb-factor button.icon.off')].map((b) => b.getAttribute('data-tip'))).toEqual(
      ['Nichts geändert', 'Es gilt bereits der Standard', 'Gilt bereits als Standard'],
    );
    iconClick(ADOPT);
    expect(status()).toBe('Standard-Faktoren');
    expect(active()).toEqual(['1,9']);

    box.click('2');
    await tick();
    expect(fields().map((f) => f.value)).toEqual(['2', '2', '2', '2', '2']);
    expect(status()).toBe('Faktoren geändert, nicht gespeichert');
    expect(icons()).toEqual([SAVE, RESET, ADOPT]);
    expect(box.root.querySelector(`button[data-tip="${SAVE}"]`)?.getAttribute('aria-label')).toBe(SAVE);

    // one place typed: no button holds all five, so the free field is marked
    type(fields()[0] as HTMLInputElement, '1.8');
    await tick();
    expect(rows()[1]).toBe('P1 4.689 – –');
    expect(active()).toEqual(['field']);
    await ctx.settings.set('gbOwn.copy.factor', true);
    await tick();
    expect(copyField().value).toContain('1,8/2');

    // the change survives opening the building again, as long as the page is not reloaded
    openOwn(onlyOwner);
    await tick();
    expect(status()).toBe('Faktoren geändert, nicht gespeichert');
    iconClick(SAVE);
    await tick();
    expect(status()).toBe('Faktoren für dieses LG gespeichert');
    expect(icons()).toEqual([RESET, ADOPT]);
    expect(ctx.ui.pref('gbOwn.factors.X_FutureEra_Landmark1')).toBeDefined();

    iconClick(ADOPT);
    await tick();
    expect(icons()).toEqual([RESET]);
    expect(ctx.ui.pref('gbOwn.factorDefault')).toBeDefined();
    iconClick(RESET);
    await tick();
    // back on the standard, which is the five just adopted
    expect(status()).toBe('Standard-Faktoren');
    expect(icons()).toEqual([]);
    expect(fields().map((f) => f.value)).toEqual(['1.8', '2', '2', '2', '2']);

    // a new factor in the settings sets all five alike again
    await ctx.settings.set('gbOwn.factor', 80);
    await tick();
    expect(ctx.ui.pref('gbOwn.factorDefault')).toBeUndefined();
    expect(fields().map((f) => f.value)).toEqual(['1.8', '1.8', '1.8', '1.8', '1.8']);
    expect(rows()[1]).toBe('P1 4.689 – –');
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
      'P1 4.950 – –',
      // promised 3.000 against 2.480 at the factor: 520 more
      'P2 – 3.000 +520',
      'P3 827 – –',
      'P4 209 – –',
      'P5 38 – –',
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
    expect(rows().filter((r) => /^P[12]/.test(r))).toEqual(['P1 – 15.600 +10.650', 'P2 – 1.000 -1.480']);
    const cell = box.root.querySelectorAll('tr')[3]?.querySelectorAll('td')[5];
    expect(cell?.className).toBe('num short');
    expect(cell?.getAttribute('data-tip')).toBe('eingezahlt 1.000 · nach Faktor 2.480');
  });

  it('keeps the player in the tooltip, danger and levels in the state column, and the table in fixed columns', async () => {
    const { box, openOwn, type } = setup();
    openOwn();
    await tick();
    const table = box.root.querySelector('table.own-share') as HTMLElement;
    // fixed widths per column, one col for each of the eight columns
    expect(table.querySelectorAll('colgroup col').length).toBe(8);
    // a name is not in the cell text, only in the tooltip and the aria-label
    const tr = [...box.root.querySelectorAll('tr')].find((r) => r.querySelector('td')?.textContent === 'P1');
    const who = tr?.querySelectorAll('td')[1];
    expect(who?.textContent?.trim()).toBe('');
    // 14.000 promised for P1: P2 is in danger, P3 levels the building
    type(box.root.querySelectorAll('input.ext')[0] as HTMLInputElement, '14000');
    await tick();
    const state = (rank: number) =>
      [...box.root.querySelectorAll('tr')]
        .find((r) => r.querySelector('td')?.textContent === `P${rank}`)
        ?.querySelectorAll('td')[2];
    const p1 = [...box.root.querySelectorAll('tr')].find((r) => r.querySelector('td')?.textContent === 'P1');
    expect(p1?.querySelectorAll('td')[1]?.querySelector('.marker')?.getAttribute('data-tip')).toBe('zugesagt');
    const danger = state(2)?.querySelector('.marker.danger');
    expect(danger?.textContent?.trim()).toMatch(/^\d/);
    expect(danger?.getAttribute('data-tip')).toBe(
      `Gefahr: ein anderer sichert den Platz ${danger?.textContent?.trim()} FP günstiger`,
    );
    const levels = state(3)?.querySelector('.marker.levels');
    expect(levels?.getAttribute('data-tip')).toBe('die Zahlung auf diesen Platz levelt das LG');
    expect(state(2)?.textContent).not.toContain('Gefahr');
  });

  it('names a paying holder in the tooltip of the player icon, not in the cell', async () => {
    const { box, openOwn } = setup();
    openOwn((r) =>
      onlyOwner(r).map((row) =>
        'rank' in row && row.rank === 1
          ? ({
              ...row,
              forge_points: 6000,
              player: { name: 'Alice Langername', avatar: '', __class__: 'OtherPlayer' },
            } as Row)
          : row,
      ),
    );
    await tick();
    const p1 = [...box.root.querySelectorAll('tr')].find((r) => r.querySelector('td')?.textContent === 'P1');
    const marker = p1?.querySelectorAll('td')[1]?.querySelector('.marker');
    expect(marker?.getAttribute('data-tip')).toBe('Alice Langername');
    expect(marker?.getAttribute('aria-label')).toBe('Alice Langername');
    expect(p1?.textContent).not.toContain('Alice');
  });

  it('counts a place without Forge points with 1 FP by default, and leaves it out when told so', async () => {
    const { openOwn, rows, copyField, ctx } = setup();
    // P5 of an early level pays blueprints and medals only
    openOwn((r) =>
      onlyOwner(r).map((row) =>
        'rank' in row && row.rank === 5
          ? ({ ...row, reward: { ...(row as { reward: object }).reward, strategy_point_amount: 0 } } as Row)
          : row,
      ),
    );
    await ctx.settings.set('gbOwn.copy.mode', 'autoUnsafe');
    await tick();
    expect(rows().find((r) => r.startsWith('P5'))).toBe('P5 1 – –');
    expect(copyField().value).toBe('Ich X_FutureEra_Landmark1 P5(1) P4(209) P3(827) P2(2480) P1(4950)');
    await ctx.settings.set('gbOwn.oneFpForNoReward', false);
    await tick();
    expect(rows().find((r) => r.startsWith('P5'))).toBe('P5 – – –');
    expect(copyField().value).toBe('Ich X_FutureEra_Landmark1 P4(209) P3(827) P2(2480) P1(4950)');
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

  describe('own level up', () => {
    /** the own Château Frontenac 12 → 13 as recorded on de20 2026-10-23, the owner pays the last 2 FP */
    const openLevelUp = async () => {
      const env = setup(levelUp.startup as Entry[]);
      env.send(...(levelUp.opening as Entry[]));
      await tick();
      return env;
    };
    const fields = (root: HTMLElement, selector: string) =>
      ([...root.querySelectorAll(selector)] as HTMLInputElement[]).map((f) => f.value);

    it('switches to the new level with the rankings of the own contribution, drops Ext and keeps the factors', async () => {
      const { box, send, sendWs, rows, type } = await openLevelUp();
      expect(box.text).toContain('12 → 13');
      expect(box.text).toContain('eingezahlt 228');
      type(box.root.querySelector('input.place-factor') as HTMLInputElement, '1.8');
      type(box.root.querySelectorAll('input.ext')[2] as HTMLInputElement, '200');
      await tick();
      expect(fields(box.root, 'input.ext')).toContain('200');

      // one response: contributeForgePoints with the empty rankings of level 13, the building on 13 in updateEntity and
      // reset; then the websocket entity_level_up
      send(...(levelUp.contribution as Entry[]));
      sendWs(levelUp.event as Entry);
      await tick();
      expect(box.text).toContain('13 → 14');
      expect(box.text).not.toContain('Bitte neu öffnen');
      expect(box.text).toContain('eingezahlt 0');
      expect(box.text).not.toContain('Seit dem Öffnen');
      // the empty places of level 13 (rewards 130, 65, 20, 5, 1 FP) at 1,8 for P1 and 1,9 for the rest
      expect(rows()).toEqual([
        'Eigene FP 449 (=449) –',
        'P1 234 – –',
        // danger: someone else secures P2 for 7 FP less
        'P2 7 124 – –',
        'Eigene FP 34 (=483) –',
        'P3 38 – –',
        'Eigene FP 18 (=501) –',
        'P4 10 – –',
        'Eigene FP 8 (=509) –',
        'P5 1 – –',
        'Eigene FP 1 (=510) –',
      ]);
      // Ext belongs to the old level, the factors to the building
      expect(fields(box.root, 'input.ext').filter(Boolean)).toEqual([]);
      // P5 pays no Forge points on level 13, so it has no factor field
      expect(fields(box.root, 'input.place-factor')).toEqual(['1.8', '1.9', '1.9', '1.9']);
    });

    it('still asks to reopen when only the building reports the new level', async () => {
      const { box, send } = await openLevelUp();
      const updateEntity = levelUp.contribution.find((e) => e.requestMethod === 'updateEntity') as Entry;
      send(updateEntity);
      await tick();
      expect(box.text).toContain('Das LG ist auf Stufe 13 gelevelt. Bitte neu öffnen.');
    });
  });

  it('opens from the menu with a hint before any own great building', () => {
    const { box, menu } = setup();
    menu('gbOwnShare');
    expect(box.text).toContain('Noch kein eigenes LG geöffnet.');
  });

  describe('level preview', () => {
    const levelInput = (root: HTMLElement) => root.querySelector('.gb-levels input') as HTMLInputElement;
    const choose = (root: HTMLElement, level: number) => {
      const input = levelInput(root);
      input.value = String(level);
      input.dispatchEvent(new Event('change'));
    };

    it('previews the next level of a building at its unlocked maximum instead of refusing', async () => {
      const { box, openOwn, updateArc, loadDefinitions } = setup();
      loadDefinitions();
      openOwn();
      await tick();
      updateArc({}, { max_level: 135 });
      await tick();
      expect(box.text).toContain('Vorschau Stufe 135 → 136');
      expect(box.text).toContain('noch nicht freigeschaltet');
      expect(box.text).not.toContain('Laufend');
      expect(box.root.querySelector('input.ext')).toBeNull();
      choose(box.root, 137);
      expect(box.text).toContain('Vorschau Stufe 137 → 138');
    });

    it('shows a later level open and empty and goes back with the button or the current level', async () => {
      const { box, openOwn, rows, updateArc, loadDefinitions } = setup();
      loadDefinitions();
      openOwn();
      await tick();
      updateArc({ invested_forge_points: 5200 });
      await tick();
      expect(levelInput(box.root).value).toBe('135');
      expect(box.text).not.toContain('Laufend');
      choose(box.root, 140);
      expect(box.text).toContain('Laufend 135 → 136');
      expect(box.text).toContain('Vorschau Stufe 140 → 141');
      expect(box.text).not.toContain('noch nicht freigeschaltet');
      // no deposits, no Ext, no live Forge points; the own share is the whole level less the places at 1,9
      expect(box.root.querySelector('input.ext')).toBeNull();
      // the Ext column stays, empty, so the widths do not change
      expect(box.root.querySelectorAll('colgroup col').length).toBe(8);
      const p1Cells = [...box.root.querySelectorAll('tr')]
        .find((r) => r.querySelector('td')?.textContent === 'P1')
        ?.querySelectorAll('td');
      expect(p1Cells?.length).toBe(8);
      expect(p1Cells?.[6]?.textContent).toBe('');
      expect(box.text).not.toContain('Seit dem Öffnen');
      expect(rows()).toEqual(PREVIEW_140);
      expect(box.text).toContain(PREVIEW_140_TOTAL);
      expect(box.text).toContain('eingezahlt 0');
      expect(box.root.querySelector('.estimate')).toBeNull();
      box.click('Laufend');
      expect(box.text).not.toContain('Vorschau Stufe');
      expect(box.text).toContain('Seit dem Öffnen +55 FP von anderen');
      expect(rows()[1]).toBe('P1 4.950 – –');
      choose(box.root, 140);
      choose(box.root, 135);
      expect(box.text).not.toContain('Vorschau Stufe');
      expect(levelInput(box.root).value).toBe('135');
    });

    it('applies the factors of the places and copies the previewed level', async () => {
      const { box, openOwn, rows, copyField, ctx, type, loadDefinitions } = setup();
      loadDefinitions();
      openOwn();
      await tick();
      await ctx.settings.set('gbOwn.copy.mode', 'autoUnsafe');
      await ctx.settings.set('gbOwn.copy.level', true);
      choose(box.root, 140);
      expect(copyField().value).toBe(PREVIEW_140_COPY);
      box.click('2');
      await tick();
      expect(rows()).toEqual(PREVIEW_140_AT_2);
      // one place on its own factor, kept for the building like on the open level
      type(box.root.querySelectorAll('input.place-factor')[4] as HTMLInputElement, '1');
      await tick();
      expect(rows().find((r) => r.startsWith('P5'))).toBe('P5 25 – –');
      expect(box.root.querySelector('.factor-status')?.getAttribute('data-tip')).toBe(
        'Faktoren geändert, nicht gespeichert',
      );
      box.click('Laufend');
      expect(box.root.querySelectorAll<HTMLInputElement>('input.place-factor')[4]?.value).toBe('1');
    });

    it('marks payments from estimated rewards and says when the level is locked', async () => {
      const { box, openOwn, rows, loadDefinitions } = setup();
      loadDefinitions();
      openOwn();
      await tick();
      choose(box.root, 421);
      expect(box.text).toContain('noch nicht freigeschaltet');
      const p1 = [...box.root.querySelectorAll('tr')].find((tr) => tr.querySelector('td')?.textContent === 'P1');
      const pay = p1?.querySelectorAll('td')[3];
      expect(pay?.className).toBe('num estimate');
      expect(pay?.getAttribute('data-tip')).toBe('Belohnung geschätzt, auf etwa 5 FP genau');
      expect(pay?.textContent).toContain('≈');
      expect(box.text).toContain('Belohnung geschätzt, auf etwa 5 FP genau');
      expect(rows().length).toBeGreaterThan(0);
    });

    it('says what is missing without the definition or past every known level', async () => {
      const { box, openOwn, loadDefinitions } = setup();
      openOwn();
      await tick();
      choose(box.root, 140);
      expect(box.text).toContain('Definition des LGs ist noch nicht geladen');
      expect(box.root.querySelector('table')).toBeNull();
      loadDefinitions();
      // definitions are announced once per batch, a moment later
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(box.text).not.toContain('Definition des LGs ist noch nicht geladen');
      choose(box.root, 2000);
      expect(box.text).toContain('Für diese Stufe ist die Belohnung nicht bekannt.');
      expect(box.text).toContain('Die Stufe kostet');
      expect(box.root.querySelector('.copy-text')).toBeNull();
    });

    it('starts on the open level again when a great building is opened', async () => {
      const { box, openOwn, loadDefinitions } = setup();
      loadDefinitions();
      openOwn();
      await tick();
      choose(box.root, 140);
      openOwn();
      await tick();
      expect(box.text).not.toContain('Vorschau Stufe');
      expect(levelInput(box.root).value).toBe('135');
    });
  });
});

/** the Arc on 140 → 141 at 1,9, nobody paid in yet: the level and its own share */
const PREVIEW_140 = [
  'Eigene FP 14.302 (=14.302) –',
  'P1 5.168 – –',
  'P2 2.584 – –',
  'Eigene FP 854 (=15.156) –',
  'P3 865 – –',
  'Eigene FP 427 (=15.583) –',
  'P4 219 – –',
  'Eigene FP 123 (=15.706) –',
  'P5 48 – –',
  'Eigene FP 48 (=15.754) –',
];
const PREVIEW_140_TOTAL = 'Eigenanteil: 15.754 FP';
const PREVIEW_140_COPY = 'Ich Die Arche 140→141 P5(48) P4(219) P3(865) P2(2584) P1(5168)';
/** the same at 2: the factor buttons set the places of the preview as of the open level */
const PREVIEW_140_AT_2 = [
  'Eigene FP 13.758 (=13.758) –',
  'P1 5.440 – –',
  'P2 2.720 – –',
  'Eigene FP 900 (=14.658) –',
  'P3 910 – –',
  'Eigene FP 450 (=15.108) –',
  'P4 230 – –',
  'Eigene FP 130 (=15.238) –',
  'P5 50 – –',
  'Eigene FP 50 (=15.288) –',
];
