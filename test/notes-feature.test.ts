// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notesFeature } from '../src/content/features/notes/index';
import { PLAYER_GROUP } from '../src/content/stores/notes';
import type { PlayerObservation } from '../src/content/stores/players';
import { SAVE_DELAY } from '../src/content/ui/note-editor';
import { eraId, playerId, worldId } from '../src/shared/ids';
import { featureContext } from './helpers/feature-context';

const world = worldId('de20');
const obs = (id: number, name: string): PlayerObservation => ({
  id: playerId(id),
  name,
  avatar: '',
  cityName: '',
  era: eraId('IronAge'),
  score: 1,
  rank: 1,
  active: true,
  guild: null,
});

function setup() {
  const env = featureContext();
  notesFeature.setup(env.ctx);
  env.menu('notes');
  const box = env.boxes.get('notes') as NonNullable<ReturnType<typeof env.boxes.get>>;
  const root = box.root;
  const input = (selector: string) => root.querySelector(selector) as HTMLInputElement;
  const enter = (el: HTMLInputElement, text: string, key = 'Enter') => {
    el.value = text;
    el.dispatchEvent(new KeyboardEvent('keydown', { key }));
  };
  const typeInto = (el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
    el.value = text;
    el.dispatchEvent(new Event('input'));
  };
  const row = (text: string) => {
    // only the row's own text: its timestamp ("heute 00:13") and lit's comment markers ("?lit$4711$") hold digits too
    const own = (l: Element) =>
      [...l.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('')
        .trim();
    const li = [...root.querySelectorAll('li')].find((l) => own(l).includes(text));
    if (!li) throw new Error(`no row "${text}"`);
    return li;
  };
  return { ...env, box, root, input, enter, typeInto, row, notes: env.ctx.notes };
}

afterEach(() => vi.useRealTimers());

describe('notes feature', () => {
  it('opens on the player group, which cannot be renamed or deleted', () => {
    const { box, root } = setup();
    expect(box.text).toContain('Spieler');
    expect(box.text).toContain('Noch keine Spieler-Notizen.');
    expect(box.text).not.toContain('Gruppe löschen');
    root.querySelector('nav button')?.dispatchEvent(new Event('dblclick'));
    expect(root.querySelector('input.inline')).toBeNull();
  });

  it('adds a group with an inline name and cancels an empty one or on Escape', () => {
    const { box, notes, input, enter } = setup();
    box.click('+');
    enter(input('input.inline'), '  ');
    expect(notes.groups()).toEqual([]);
    box.click('+');
    enter(input('input.inline'), 'Gilde', 'Escape');
    expect(notes.groups()).toEqual([]);
    box.click('+');
    const field = input('input.inline');
    enter(field, ' Gilde ');
    field.dispatchEvent(new Event('blur'));
    expect(notes.groups().map((g) => g.name)).toEqual(['Gilde']);
    expect(box.text).toContain('Noch keine Seiten.');
    expect(box.text).toContain('Gruppe löschen');
  });

  it('adds pages to the top, renames them inline and in the header', () => {
    const { box, notes, input, enter, row } = setup();
    const group = notes.addGroup('Gilde');
    box.click('Gilde');
    box.click('+ Neue Seite');
    enter(input('input.inline'), 'Erste');
    box.click('+ Neue Seite');
    enter(input('input.inline'), 'Zweite');
    expect(notes.pages(group.id).map((p) => p.title)).toEqual(['Zweite', 'Erste']);

    row('Erste').dispatchEvent(new Event('dblclick'));
    enter(input('input.inline'), 'Umbenannt');
    expect(notes.pages(group.id).map((p) => p.title)).toEqual(['Zweite', 'Umbenannt']);

    row('Umbenannt').click();
    const title = input('input.title');
    expect(title.value).toBe('Umbenannt');
    title.value = 'Kopf';
    title.dispatchEvent(new Event('change'));
    expect(notes.pages(group.id)[1]?.title).toBe('Kopf');
    title.value = ' ';
    title.dispatchEvent(new Event('change'));
    expect(title.value).toBe('Kopf');
  });

  it('saves the text of a page while typing and shows it rendered after leaving', () => {
    vi.useFakeTimers();
    const { box, root, notes, typeInto } = setup();
    const group = notes.addGroup('Gilde');
    const page = notes.addPage(group.id, 'Regeln');
    box.click('Gilde');
    (root.querySelector('.note') as HTMLElement).click();
    const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
    typeInto(textarea, '# Regeln\nkeine **Diamanten**');
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(notes.page(page?.id ?? '')?.text).toBe('# Regeln\nkeine **Diamanten**');
    expect(root.querySelector('textarea')).toBe(textarea);
    textarea.dispatchEvent(new Event('blur'));
    expect(root.querySelector('h3')?.textContent).toBe('Regeln');
    expect(root.querySelector('strong')?.textContent).toBe('Diamanten');
  });

  it('asks before deleting a group and names the pages that go with it', () => {
    const { box, notes } = setup();
    const group = notes.addGroup('Gilde');
    notes.addPage(group.id, 'a');
    notes.addPage(group.id, 'b');
    box.click('Gilde');
    box.click('Gruppe löschen');
    expect(box.text).toContain('Gruppe „Gilde“ mit 2 Seiten löschen?');
    box.click('Abbrechen');
    expect(notes.groups()).toHaveLength(1);
    box.click('Gruppe löschen');
    box.click('Löschen');
    expect(notes.groups()).toEqual([]);
    expect(notes.allPages()).toEqual([]);
    expect(box.text).toContain('Noch keine Spieler-Notizen.');
  });

  it('asks before deleting a page', () => {
    const { box, notes } = setup();
    const group = notes.addGroup('Gilde');
    notes.addPage(group.id, 'Weg damit');
    box.click('Gilde');
    box.click('Seite löschen');
    expect(box.text).toContain('Seite „Weg damit“ löschen?');
    box.click('Löschen');
    expect(notes.allPages()).toEqual([]);
  });

  it('finds notes by title and text and opens a result', () => {
    const { box, root, notes, typeInto, ctx } = setup();
    const group = notes.addGroup('Gilde');
    const page = notes.addPage(group.id, 'Regeln');
    notes.setText(page?.id ?? '', 'Wir **plündern** nur Inaktive');
    ctx.players.apply(world, [obs(7, 'Anna')], 'visit');
    notes.setPlayerText(playerId(7), 'plündert zurück');
    notes.addPage(group.id, 'Anderes');

    const field = root.querySelector('input[type=search]') as HTMLInputElement;
    typeInto(field, 'PLÜNDER');
    // the same field stays, so it keeps its focus while the results replace the tabs
    expect(root.querySelector('input[type=search]')).toBe(field);
    expect(box.text).toContain('Gilde › Regeln');
    expect(box.text).toContain('Wir plündern nur Inaktive');
    expect(box.text).toContain('Spieler › Anna');
    expect(box.text).not.toContain('Anderes');

    [...root.querySelectorAll('li')].find((l) => l.textContent?.includes('Regeln'))?.click();
    expect(box.text).not.toContain('Spieler › Anna');
    expect((root.querySelector('input.title') as HTMLInputElement).value).toBe('Regeln');
  });

  it('picks a player, creates the page with the first text and lists it with live name and relations', () => {
    vi.useFakeTimers();
    const { box, root, notes, ctx, input, enter, typeInto } = setup();
    ctx.session.start({ world, playerId: playerId(1), name: 'Ich', era: eraId('IronAge') });
    ctx.players.apply(world, [obs(1, 'Ich'), obs(2, 'Bert'), obs(3, 'Berta')], 'visit');
    ctx.players.applySocialList(world, { neighbor: [obs(3, 'Berta')], guildMember: [], friend: [] });
    box.click('+ Spieler');
    const search = input('.card input[type=search]');
    typeInto(search, 'ber');
    expect(box.text).not.toContain('Ich');
    enter(search, 'ber');
    expect(box.text).toContain('Bert');
    expect(notes.playerPage(playerId(2))).toBeUndefined();

    (root.querySelector('.note') as HTMLElement).click();
    typeInto(root.querySelector('textarea') as HTMLTextAreaElement, 'stark');
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(notes.playerPage(playerId(2))).toMatchObject({ text: 'stark', title: 'Bert', group: PLAYER_GROUP });

    notes.setPlayerText(playerId(3), 'Nachbarin', 'Berta');
    ctx.players.apply(world, [obs(3, 'Berta Neu')], 'visit');
    expect(box.text).toContain('🏘️ Berta Neu');
  });

  it('removes a deleted player page from the list instead of keeping it as an empty draft', () => {
    const { box, root, notes, ctx } = setup();
    ctx.players.apply(world, [obs(2, 'Bert')], 'visit');
    notes.setPlayerText(playerId(2), 'stark');
    [...root.querySelectorAll<HTMLElement>('.side li')].find((l) => l.textContent?.includes('Bert'))?.click();
    box.click('Seite löschen');
    box.click('Löschen');
    expect(notes.playerPage(playerId(2))).toBeUndefined();
    expect([...root.querySelectorAll('.side li')].some((l) => l.textContent?.includes('Bert'))).toBe(false);
  });

  it('filters the player pages by relation', () => {
    const { box, root, notes, ctx } = setup();
    ctx.players.apply(world, [obs(2, 'Bert'), obs(3, 'Berta')], 'visit');
    ctx.players.applySocialList(world, { neighbor: [obs(3, 'Berta')], guildMember: [], friend: [] });
    notes.setPlayerText(playerId(2), 'x');
    notes.setPlayerText(playerId(3), 'y');
    notes.setPlayerText(playerId(4), 'z', 'Unbekannt');
    const filter = (value: string) => {
      const select = root.querySelector('select') as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };
    const listed = () => [...root.querySelectorAll('.side li')].map((l) => l.textContent?.trim().split('\n')[0]);
    expect(listed()).toEqual(['Bert', '🏘️ Berta', 'Unbekannt']);
    filter('neighbor');
    expect(listed()).toEqual(['🏘️ Berta']);
    filter('other');
    expect(listed()).toEqual(['Bert', 'Unbekannt']);
    filter('friend');
    expect(box.text).toContain('Keine Spieler-Notizen zu diesem Filter.');
  });

  it('limits the picker and puts players with a page first', () => {
    const { box, root, notes, ctx } = setup();
    ctx.players.apply(
      world,
      Array.from({ length: 60 }, (_, i) => obs(100 + i, `P${String(i).padStart(2, '0')}`)),
      'visit',
    );
    notes.setPlayerText(playerId(159), 'x');
    box.click('+ Spieler');
    const rows = [...root.querySelectorAll('.card li')].map((l) => l.textContent?.trim());
    expect(rows).toHaveLength(50);
    expect(rows[0]).toBe('📝 P59');
    expect(box.text).toContain('weitere, Suche eingrenzen');
  });

  it('keeps the selection when the store changes elsewhere', () => {
    const { box, notes } = setup();
    const group = notes.addGroup('Gilde');
    notes.addPage(group.id, 'one');
    notes.addPage(group.id, 'two');
    box.click('Gilde');
    notes.addGroup('Andere');
    expect(box.text).toContain('Gruppe löschen');
    expect(box.root.querySelector('nav button.active')?.textContent).toBe('Gilde');
    expect((box.root.querySelector('input.title') as HTMLInputElement).value).toBe('two');
  });

  it('moves groups and pages by drag and drop', () => {
    const { box, root, notes, row } = setup();
    const [a] = ['A', 'B', 'C'].map((n) => notes.addGroup(n));
    const tab = (name: string) => [...root.querySelectorAll('nav button')].find((b) => b.textContent === name);
    tab('C')?.dispatchEvent(new Event('dragstart'));
    tab('A')?.dispatchEvent(new Event('drop'));
    expect(notes.groups().map((g) => g.name)).toEqual(['C', 'A', 'B']);

    box.click('A');
    for (const title of ['3', '2', '1']) notes.addPage(a?.id ?? '', title);
    row('1').dispatchEvent(new Event('dragstart'));
    row('3').dispatchEvent(new Event('drop'));
    expect(notes.pages(a?.id ?? '').map((p) => p.title)).toEqual(['2', '3', '1']);
  });
});
