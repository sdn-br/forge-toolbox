// @vitest-environment happy-dom
import { html, render, type TemplateResult } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { leadCells } from '../src/content/features/investments/row-parts';
import { commonRowVm, rowNames } from '../src/content/features/investments/rows';
import { plundersViewModel } from '../src/content/features/pvp/plunders/view-model';
import { pvpView } from '../src/content/features/pvp/view';
import type { GbLookups } from '../src/content/features/shared/gb-lookups';
import { ownerOf, ownerVm } from '../src/content/ui/owner-line';
import { buildingDefId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import { playerLookups } from './helpers/player-lookups';

const GUILD = { name: 'Die Gilde', url: 'https://foestats.com/de/de20/guilds/7' };
const noop = () => {};

const draw = (t: TemplateResult) => {
  const el = document.createElement('div');
  render(t, el);
  return el;
};

const lookups = (guild?: typeof GUILD, ownerIgnored = false): GbLookups => ({
  greatBuildingName: () => 'Arche',
  playerName: () => 'Anna',
  playerUrl: (id) => `https://foestats.com/de/de20/players/${id}`,
  playerGuild: () => guild,
  relations: () => ({ neighbor: false, friend: true, guildMember: false }),
  isMarked: () => false,
  playerMarked: () => false,
  isIgnored: () => false,
  ownerIgnored: () => ownerIgnored,
});

describe('owner line', () => {
  const line = (guild?: typeof GUILD) =>
    draw(html`${ownerOf(ownerVm(lookups(guild), playerId(1001), 'Anna'), noop, noop)}`);

  it('shows the guild in brackets after the name, linked to its page at foestats', () => {
    const el = line(GUILD);
    expect(el.textContent?.replace(/\s+/g, ' ').trim()).toBe('Eigentümer: Anna [Die Gilde]');
    const links = [...el.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Anna', 'https://foestats.com/de/de20/players/1001'],
      ['Die Gilde', GUILD.url],
    ]);
  });

  it('shows nothing more without a known guild', () => {
    const el = line();
    expect(el.textContent?.replace(/\s+/g, ' ').trim()).toBe('Eigentümer: Anna');
    expect(el.querySelectorAll('a')).toHaveLength(1);
  });
});

describe('investments owner cell', () => {
  const ownerTip = (guild?: typeof GUILD, ownerIgnored = false) => {
    const input = lookups(guild, ownerIgnored);
    const b = {
      owner: playerId(1001),
      entityId: 1,
      cityEntityId: buildingDefId('X_Arche'),
      level: 10,
      invested: 0,
      required: 100,
    };
    const r = commonRowVm(input, b, rowNames(input, b));
    const actions = { mark: noop, markPlayer: noop, ignore: noop, ignorePlayer: noop, pickPlayer: noop };
    const el = draw(html`<table><tr>${leadCells(r, '', actions, 'investments.growthHint')}</tr></table>`);
    return el.querySelectorAll('td')[1]?.getAttribute('data-tip');
  };

  it('has the name with the guild as tooltip', () => {
    expect(ownerTip(GUILD)).toBe('Anna [Die Gilde]');
  });

  it('has just the name without a known guild', () => {
    expect(ownerTip()).toBe('Anna');
  });

  it('keeps the hint of an ignored row as a second line', () => {
    expect(ownerTip(GUILD, true)).toBe('Anna [Die Gilde]\nSpieler ignoriert');
  });
});

describe('pvp opponent name', () => {
  it('has the name with the guild as tooltip, just the name without a known guild', () => {
    const vm = plundersViewModel({
      plunders: [1001, 1002].map((id) => ({
        world: worldId('de20'),
        at: 0,
        opponent: playerId(id),
        outcome: 'repelled' as const,
        entityId: 1,
        doubleLoot: false,
        resources: {},
      })),
      plunderTotals: { count: 2, repelled: 2, fp: 0 },
      page: 0,
      filter: { text: '' },
      lookups: playerLookups({
        playerName: (id: PlayerId) => (id === 1001 ? 'Anna' : 'Bert'),
        playerGuild: (id: PlayerId) => (id === 1001 ? GUILD : undefined),
      }),
      building: () => undefined,
      resourceName: () => undefined,
      note: () => undefined,
      now: 0,
      expanded: new Set(),
    });
    const actions = { tab: noop, search: noop, pick: noop, clearPick: noop, page: noop, expand: noop, note: noop };
    const names = [...draw(pvpView(vm, actions)).querySelectorAll('tr a[href="#"]')];
    expect(names.map((a) => [a.textContent, a.getAttribute('data-tip')])).toEqual([
      ['Anna', 'Anna [Die Gilde]'],
      ['Bert', 'Bert'],
    ]);
  });
});
