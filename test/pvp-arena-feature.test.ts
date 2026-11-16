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
    tr.querySelector('.pvp-result')?.querySelector('[aria-label]')?.getAttribute('aria-label') ??
      tr.querySelector('.pvp-result')?.getAttribute('data-tip'),
    tr.querySelector('.pvp-points')?.textContent,
  ]);
const row = (box: TestBox, name: string) =>
  [...box.root.querySelectorAll('.pvp-arena tbody tr')].find(
    (tr) => tr.querySelector('.name-cell a')?.textContent === name,
  ) as HTMLElement;
const panel = (box: TestBox) => box.root.querySelector('.side-panel')?.textContent ?? '';
const activeTab = (box: TestBox) => box.root.querySelector('.tabs button.active, .tabs button[aria-selected="true"]');

/** the battle with its line, then the overview: the box opens on the arena */
async function opened() {
  const env = setup();
  env.send(arena.battle);
  env.send(arena.overview);
  await vi.waitFor(() => expect(rows(env.box)).toHaveLength(7));
  return env;
}

describe('pvp arena tab', () => {
  it('opens the box on the arena tab when the arena opens, with the log newest first', async () => {
    const { box } = await opened();
    expect(box.box.isOpen).toBe(true);
    expect(activeTab(box)?.textContent?.trim()).toBe('Arena');
    expect(rows(box)).toEqual([
      ['Testgegner 2', 'Angriff gewonnen', '+400'],
      ['Testgegner 4', 'Angriff verloren', '−535'],
      ['Testgegner 5', 'Angriff gewonnen', '+529'],
      ['Testgegner 6', 'Angriff verloren', '−628'],
      ['Testgegner 5', 'Angriff gewonnen', '+529'],
      ['Testgegner 7', 'Angriff verloren', '−628'],
      ['Testgegner 8', 'Verteidigung: angegriffen von diesem Spieler', '−55'],
    ]);
    expect(box.text).toContain('6 Angriffe, 3 gewonnen · 1 Verteidigung · −388 Punkte');
    // the attack icons of the battles tab in their colours, the defense as a word
    expect(row(box, 'Testgegner 2').querySelector('td.pvp-result.won svg')).not.toBeNull();
    expect(row(box, 'Testgegner 4').querySelector('td.pvp-result.lost svg')).not.toBeNull();
    expect(row(box, 'Testgegner 8').querySelector('td.pvp-result.defense')?.textContent).toBe('Verteidigung');
    expect(row(box, 'Testgegner 2').querySelector('td.pvp-points.good')).not.toBeNull();
    expect(row(box, 'Testgegner 4').querySelector('td.pvp-points.bad')).not.toBeNull();
  });

  it('filters by kind with two toggles, both on by default; both off show no row', async () => {
    const { box } = await opened();
    // the sack toggles belong to the battles
    expect(box.root.querySelector('[aria-label="Kämpfe mit Plünderung zeigen"]')).toBeNull();
    const pressed = [...box.root.querySelectorAll('.pvp-kind-filter button')].map((b) => [
      b.getAttribute('aria-label'),
      b.getAttribute('aria-pressed'),
    ]);
    expect(pressed).toEqual([
      ['Angriffe zeigen', 'true'],
      ['Verteidigungen zeigen', 'true'],
    ]);

    box.click('Verteidigungen zeigen');
    await vi.waitFor(() => expect(rows(box)).toHaveLength(6));
    expect(box.text).toContain('6 Angriffe, 3 gewonnen · −333 Punkte');

    box.click('Angriffe zeigen');
    await vi.waitFor(() => expect(box.text).toContain('Keine Arena-Kämpfe zu diesem Filter.'));
    expect(rows(box)).toHaveLength(0);

    box.click('Verteidigungen zeigen');
    await vi.waitFor(() => expect(rows(box)).toEqual([['Testgegner 8', expect.any(String), '−55']]));
  });

  it('shows the stored battle of an attack in the side panel; lines without one are not selectable', async () => {
    const { box } = await opened();
    expect(row(box, 'Testgegner 2').classList.contains('battle-row')).toBe(true);
    expect(row(box, 'Testgegner 4').classList.contains('battle-row')).toBe(false);
    expect(row(box, 'Testgegner 8').classList.contains('battle-row')).toBe(false);

    row(box, 'Testgegner 4').click();
    row(box, 'Testgegner 8').click();
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
    await vi.waitFor(() => expect(rows(box)).toHaveLength(8));
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
    await vi.waitFor(() => expect(rows(box)).toHaveLength(6));
    expect(activeTab(box)?.textContent?.trim()).toBe('Arena');
  });
});
