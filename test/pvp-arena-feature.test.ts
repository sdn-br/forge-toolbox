// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { OPEN_WITH_ARENA, pvpFeature } from '../src/content/features/pvp/index';
import { registerGameHandlers } from '../src/content/game/handlers';
import arena from './fixtures/arena.json';
import manual from './fixtures/arena-manual-battle.json';
import { featureContext } from './helpers/feature-context';

/** the box on the real stores, fed by the game handlers with the recorded arena traffic */
function setup() {
  const env = featureContext();
  pvpFeature.setup(env.ctx);
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...env.ctx, now: Date.now });
  const send = (entries: unknown[]) =>
    ingestion.accept({ kind: 'json', url: '/game/json?h=1', request: null, response: JSON.stringify(entries), at: 0 });
  send([
    { requestClass: 'StartupService', requestMethod: 'getData', responseData: { user_data: { player_id: arena.me } } },
  ]);
  const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
  return { ...env, box, send };
}

type TestBox = ReturnType<typeof setup>['box'];

/** the rows as name, result word and points */
const rows = (box: TestBox) =>
  [...box.root.querySelectorAll('.pvp-arena tbody tr')].map((tr) => [
    tr.querySelector('.name-cell a')?.textContent,
    tr.querySelector('.pvp-result')?.querySelector('[aria-label]')?.getAttribute('aria-label'),
    tr.querySelector('.pvp-points')?.textContent,
  ]);
/** the second tab row: the sub tabs of the arena */
const subTab = (box: TestBox) => box.root.querySelector('.tabs.sub button.active')?.textContent?.trim();
const row = (box: TestBox, name: string) =>
  [...box.root.querySelectorAll('.pvp-arena tbody tr')].find(
    (tr) => tr.querySelector('.name-cell a')?.textContent === name,
  ) as HTMLElement;
const panel = (box: TestBox) => box.root.querySelector('.side-panel')?.textContent ?? '';
const activeTab = (box: TestBox) => box.root.querySelector('.tabs button.active, .tabs button[aria-selected="true"]');

const pickSub = (box: TestBox, label: string) =>
  (
    [...box.root.querySelectorAll('.tabs.sub button')].find((b) => b.textContent?.trim() === label) as HTMLElement
  ).click();

/** the battle with its line, then the overview: the box opens on the arena */
async function opened() {
  const env = setup();
  env.send(arena.battle);
  env.send(arena.overview);
  await vi.waitFor(() => expect(rows(env.box)).toHaveLength(6));
  return env;
}

describe('pvp arena tab', () => {
  it('opens the box on the arena tab when the arena opens, on the attacks, newest first', async () => {
    const { box } = await opened();
    expect(box.box.isOpen).toBe(true);
    expect(activeTab(box)?.textContent?.trim()).toBe('Arena');
    expect(subTab(box)).toBe('Angriffe');
    expect(rows(box)).toEqual([
      ['Testgegner 2', 'Angriff gewonnen', '+400'],
      ['Testgegner 4', 'Angriff verloren', '−535'],
      ['Testgegner 5', 'Angriff gewonnen', '+529'],
      ['Testgegner 6', 'Angriff verloren', '−628'],
      ['Testgegner 5', 'Angriff gewonnen', '+529'],
      ['Testgegner 7', 'Angriff verloren', '−628'],
    ]);
    expect(box.text).toContain('6 Angriffe, 3 gewonnen, 3 verloren · −333 Punkte');
    expect(box.text).not.toContain('Verteidigung:');
    expect(row(box, 'Testgegner 2').querySelector('td.pvp-result.won svg')).not.toBeNull();
    expect(row(box, 'Testgegner 4').querySelector('td.pvp-result.lost svg')).not.toBeNull();
    expect(row(box, 'Testgegner 2').querySelector('td.pvp-points.good')).not.toBeNull();
    expect(row(box, 'Testgegner 4').querySelector('td.pvp-points.bad')).not.toBeNull();
    // no kind toggles any more, and the sack toggles belong to the battles
    expect(box.root.querySelector('.pvp-kind-filter')).toBeNull();
    expect(box.root.querySelector('[aria-label="Kämpfe mit Plünderung zeigen"]')).toBeNull();
  });

  it('has the sub tabs Angriffe and Verteidigungen in a second tab row', async () => {
    const { box } = await opened();
    expect([...box.root.querySelectorAll('.tabs.sub button')].map((b) => b.textContent?.trim())).toEqual([
      'Angriffe',
      'Verteidigungen',
    ]);
  });

  it('shows the defenses on their sub tab with a result column, points signed, with their own summary', async () => {
    const { box } = await opened();
    pickSub(box, 'Verteidigungen');
    await vi.waitFor(() => expect(subTab(box)).toBe('Verteidigungen'));
    await vi.waitFor(() => expect(rows(box)).toEqual([['Testgegner 8', 'Verteidigung verloren', '−55']]));
    expect(box.text).toContain('1 Verteidigung · −55 Punkte');
    expect(box.root.querySelectorAll('.pvp-arena thead th')).toHaveLength(5);
    expect(row(box, 'Testgegner 8').querySelector('td.pvp-points.bad')).not.toBeNull();
    // the arena mark of the name cell stays
    expect(row(box, 'Testgegner 8').querySelector('button[aria-label="In der Arena nicht angreifen"]')).not.toBeNull();

    pickSub(box, 'Angriffe');
    await vi.waitFor(() => expect(rows(box)).toHaveLength(6));
    expect(box.text).toContain('6 Angriffe, 3 gewonnen, 3 verloren · −333 Punkte');
  });

  it('shows a selected defense in the side panel with the player and without battle details', async () => {
    const { box } = await opened();
    pickSub(box, 'Verteidigungen');
    await vi.waitFor(() => expect(rows(box)).toHaveLength(1));
    row(box, 'Testgegner 8').click();
    expect(row(box, 'Testgegner 8').classList.contains('selected')).toBe(true);
    expect(panel(box)).toContain('Testgegner 8');
    expect(panel(box)).toContain('−55');
    expect(panel(box)).not.toContain('Deine Einheiten');
    row(box, 'Testgegner 8').click();
    expect(box.root.querySelector('.side-drawer')).toBeNull();
    // a selection ends with the sub tab
    row(box, 'Testgegner 8').click();
    pickSub(box, 'Angriffe');
    await vi.waitFor(() => expect(rows(box)).toHaveLength(6));
    expect(box.root.querySelector('.side-drawer')).toBeNull();
  });

  it('opens the arena tab on the attacks every time, the sub tab is not remembered', async () => {
    const { box, send, menu } = await opened();
    pickSub(box, 'Verteidigungen');
    await vi.waitFor(() => expect(subTab(box)).toBe('Verteidigungen'));
    // the arena opens again in the game while the box is on the defenses
    send(arena.overview);
    await vi.waitFor(() => expect(subTab(box)).toBe('Angriffe'));
    // leaving the arena tab and coming back
    pickSub(box, 'Verteidigungen');
    await vi.waitFor(() => expect(subTab(box)).toBe('Verteidigungen'));
    box.click('Kämpfe');
    await vi.waitFor(() => expect(activeTab(box)?.textContent?.trim()).toBe('Kämpfe'));
    box.click('Arena');
    await vi.waitFor(() => expect(subTab(box)).toBe('Angriffe'));
    await vi.waitFor(() => expect(rows(box)).toHaveLength(6));
    // closing and opening the box through the menu
    pickSub(box, 'Verteidigungen');
    await vi.waitFor(() => expect(subTab(box)).toBe('Verteidigungen'));
    menu('pvp');
    menu('pvp');
    expect(box.box.isOpen).toBe(true);
    await vi.waitFor(() => expect(subTab(box)).toBe('Angriffe'));
  });

  it('shows the stored battle of an attack in the side panel; lines without one are not selectable', async () => {
    const { box } = await opened();
    expect(row(box, 'Testgegner 2').classList.contains('battle-row')).toBe(true);
    expect(row(box, 'Testgegner 4').classList.contains('battle-row')).toBe(false);

    row(box, 'Testgegner 4').click();
    expect(box.root.querySelector('.side-panel')).toBeNull();

    row(box, 'Testgegner 2').click();
    expect(row(box, 'Testgegner 2').classList.contains('selected')).toBe(true);
    expect(panel(box)).toContain('Testgegner 2');
    expect(panel(box)).toContain('Deine Einheiten');
    expect(box.root.querySelector('.side-panel .pvp-outcome.won')).not.toBeNull();
    row(box, 'Testgegner 2').click();
    expect(box.root.querySelector('.side-drawer')).toBeNull();
  });

  it('matches a manual battle to its line, which comes when the battle ends, and follows new lines', async () => {
    const { box, send } = await opened();
    send(manual.start);
    send(manual.end);
    await vi.waitFor(() => expect(rows(box)).toHaveLength(7));
    expect(rows(box)[0]).toEqual(['Testgegner 1', 'Angriff verloren', '−297']);
    row(box, 'Testgegner 1').click();
    expect(panel(box)).toContain('Testgegner 1');
    expect(box.root.querySelector('.side-panel .pvp-outcome.lost')).not.toBeNull();
  });

  it('stays closed on the arena when the setting is off, which is on by default', async () => {
    const { ctx, box, send } = setup();
    expect(ctx.settings.defs.find((d) => d.key === 'pvp.openWithArena')).toMatchObject({
      label: 'pvp.openWithArena',
      default: true,
    });
    expect(ctx.settings.of(OPEN_WITH_ARENA).get()).toBe(true);
    await ctx.settings.of(OPEN_WITH_ARENA).set(false);
    send(arena.overview);
    expect(box.box.isOpen).toBe(false);
  });

  it('switches an open box to the arena tab when the arena opens', async () => {
    const { box, send, menu } = setup();
    menu('pvp');
    expect(activeTab(box)?.textContent?.trim()).toBe('Kämpfe');
    send(arena.overview);
    await vi.waitFor(() => expect(rows(box)).toHaveLength(5));
    expect(activeTab(box)?.textContent?.trim()).toBe('Arena');
    expect(subTab(box)).toBe('Angriffe');
  });

  it('shows the arena mark in the name cell instead of the PvP marks and toggles it on its own', async () => {
    const { box, ctx } = await opened();
    const cell = row(box, 'Testgegner 2').querySelector('td.name-cell') as HTMLElement;
    expect(
      [...cell.querySelectorAll(':is(button.plunder, button.no-attack)')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['In der Arena nicht angreifen']);
    const id = ctx.players.list().find((p) => p.name === 'Testgegner 2')?.id as never;
    ctx.players.setFlag(id, 'noAttack', true);
    (cell.querySelector('button[aria-label="In der Arena nicht angreifen"]') as HTMLElement).click();
    expect(ctx.players.get(id)).toMatchObject({ noAttack: true, arenaNoAttack: true });
    await vi.waitFor(() =>
      expect(
        row(box, 'Testgegner 2')
          .querySelector('button[aria-label="Markierung Arena entfernen"]')
          ?.getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    // the other tabs keep the PvP marks
    box.click('Kämpfe');
    await vi.waitFor(() => expect(box.root.querySelector('.pvp-mark-filter')).not.toBeNull());
    expect(box.root.querySelector('.pvp-arena-mark-filter')).toBeNull();
  });

  it('filters by the arena mark with its own two toggles, apart from the PvP mark toggles', async () => {
    const { box, ctx } = await opened();
    expect(box.root.querySelector('.pvp-mark-filter')).toBeNull();
    const toggles = () =>
      [...box.root.querySelectorAll('.pvp-arena-mark-filter button')].map((b) => [
        b.getAttribute('aria-label'),
        b.getAttribute('aria-pressed'),
      ]);
    // the toggle for "ohne" carries its icon, no word
    expect(box.root.querySelector('.pvp-arena-mark-filter button:last-child')?.textContent?.trim()).toBe('');
    expect(toggles()).toEqual([
      ['Arena: als nicht angreifen markierte zeigen', 'true'],
      ['Spieler ohne Arena-Markierung zeigen', 'true'],
    ]);
    const id = ctx.players.list().find((p) => p.name === 'Testgegner 5')?.id as never;
    ctx.players.setFlag(id, 'arenaNoAttack', true);

    box.click('Spieler ohne Arena-Markierung zeigen');
    await vi.waitFor(() => expect(rows(box).map((r) => r[0])).toEqual(['Testgegner 5', 'Testgegner 5']));
    expect(box.text).toContain('2 Angriffe, 2 gewonnen, 0 verloren · +1.058 Punkte');

    // the arena marks apply to the defenses too
    pickSub(box, 'Verteidigungen');
    await vi.waitFor(() => expect(rows(box)).toHaveLength(0));
    pickSub(box, 'Angriffe');
    await vi.waitFor(() => expect(rows(box)).toHaveLength(2));

    // the PvP mark toggles of the other tabs stay as they were
    box.click('Kämpfe');
    await vi.waitFor(() => expect(box.root.querySelector('.pvp-mark-filter')).not.toBeNull());
    expect(
      [...box.root.querySelectorAll('.pvp-mark-filter button')].map((b) => b.getAttribute('aria-pressed')),
    ).toEqual(['true', 'true', 'true']);
    box.click('Arena');
    await vi.waitFor(() => expect(rows(box)).toHaveLength(2));
    expect(toggles()[1]).toEqual(['Spieler ohne Arena-Markierung zeigen', 'false']);
  });
});

describe('pvp arena tab, the opponents on offer', () => {
  /** the rows of the block as name, difficulty, reward, boosts and record */
  const offers = (box: TestBox) =>
    [...box.root.querySelectorAll('.pvp-offers tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
    );
  const offerRow = (box: TestBox, name: string) =>
    [...box.root.querySelectorAll('.pvp-offers tbody tr')].find(
      (tr) => tr.querySelector('.name-cell a')?.textContent === name,
    ) as HTMLElement;

  it('shows the three offered opponents above the summary once the arena was opened, not before', async () => {
    const { box, menu } = setup();
    menu('pvp');
    box.click('Arena');
    await vi.waitFor(() => expect(activeTab(box)?.textContent?.trim()).toBe('Arena'));
    expect(box.root.querySelector('.pvp-offers')).toBeNull();
  });

  it('lists them in the order the game sends them, with the record against each from the log', async () => {
    const { box } = await opened();
    expect(offers(box)).toEqual([
      ['Testgegner 1', 'schwer', '+628', '11.674 %', '11.991 %', '0:0'],
      ['Testgegner 2', 'mittel', '+400', '3.743 %', '4.504 %', '1:0'],
      ['Testgegner 3', 'leicht', '+275', '3.722 %', '3.413 %', '0:0'],
    ]);
    // above the summary and the list, which stay as they were
    const html = box.root.innerHTML;
    expect(html.indexOf('pvp-offers')).toBeLessThan(html.indexOf('pvp-totals'));
    expect(rows(box)).toHaveLength(6);
    expect(box.root.querySelector('.pvp-offers .pvp-record')?.getAttribute('data-tip')).toBe('Noch nicht angegriffen');
    expect(offerRow(box, 'Testgegner 2').querySelector('.pvp-record')?.getAttribute('data-tip')).toMatch(
      /^1 gewonnen, 0 verloren, \+400 Punkte, zuletzt /,
    );
  });

  it('is not filtered by the arena mark toggles and does not appear on the defenses', async () => {
    const { box } = await opened();
    pickSub(box, 'Verteidigungen');
    await vi.waitFor(() => expect(subTab(box)).toBe('Verteidigungen'));
    await vi.waitFor(() => expect(rows(box)).toHaveLength(1));
    expect(box.root.querySelector('.pvp-offers')).toBeNull();
    pickSub(box, 'Angriffe');
    await vi.waitFor(() => expect(offers(box)).toHaveLength(3));
    // the arena mark toggles leave the block alone
    box.click('Spieler ohne Arena-Markierung zeigen');
    await vi.waitFor(() => expect(rows(box)).toHaveLength(0));
    expect(offers(box)).toHaveLength(3);
  });

  it('shows the new draw after a battle', async () => {
    const { box, send } = await opened();
    send(arena.battle);
    await vi.waitFor(() =>
      expect(offers(box).map((r) => r[0])).toEqual(['Testgegner 1', 'Testgegner 9', 'Testgegner 10']),
    );
  });

  it('warns for an opponent with the arena mark and follows a toggle in the block at once', async () => {
    const { box, ctx } = await opened();
    const id = ctx.players.list().find((p) => p.name === 'Testgegner 2')?.id as never;
    expect(offerRow(box, 'Testgegner 2').classList.contains('warn')).toBe(false);
    (
      offerRow(box, 'Testgegner 2').querySelector('button[aria-label="In der Arena nicht angreifen"]') as HTMLElement
    ).click();
    expect(ctx.players.get(id)).toMatchObject({ arenaNoAttack: true });
    await vi.waitFor(() => expect(offerRow(box, 'Testgegner 2').classList.contains('warn')).toBe(true));
    expect(
      offerRow(box, 'Testgegner 2')
        .querySelector('button[aria-label="Markierung Arena entfernen"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(offerRow(box, 'Testgegner 1').classList.contains('warn')).toBe(false);
    // a mark set elsewhere shows as well
    ctx.players.setFlag(id, 'arenaNoAttack', false);
    await vi.waitFor(() => expect(offerRow(box, 'Testgegner 2').classList.contains('warn')).toBe(false));
  });

  it('follows the draw after a manual battle as well and keeps the record of an opponent that stays', async () => {
    const { box, send } = await opened();
    send(manual.start);
    send(manual.end);
    await vi.waitFor(() =>
      expect(offers(box).map((r) => [r[0], r[5]])).toEqual([
        ['Testgegner 2', '1:0'],
        ['Testgegner 3', '0:0'],
        ['Testgegner 4', '0:1'],
      ]),
    );
  });
});
