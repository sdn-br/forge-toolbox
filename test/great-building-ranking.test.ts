import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { buildingDefId, eraId, guildId, playerId } from '../src/shared/ids';
import ranking from './fixtures/gb-ranking.json';
import fixture from './fixtures/great-buildings.json';
import { testStores } from './helpers/stores';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

function setup() {
  let clock = 5_000;
  const ingestion = new Ingestion();
  const { db, world, bus, now, stores } = testStores({ now: () => clock });
  registerGameHandlers(ingestion, { world, bus, now, ...stores });
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
  // the session player is 1000, as in the ranking fixture
  send(...(fixture.startup as Entry[]));
  const events: string[] = [];
  bus.on('greatBuildings.stored', (e) =>
    events.push(`stored:${e.owners ? e.owners.map((o) => `${o.owner}:${o.entityIds.join(',')}`).join(' ') : 'all'}`),
  );
  bus.on('greatBuildings.listed', (e) => events.push(`listed:${e.owner}`));
  return {
    ...stores,
    db,
    world,
    bus,
    send,
    events,
    at: (t: number) => {
      clock = t;
    },
  };
}

type RankingRow = (typeof ranking)['opened']['responseData']['rankings'][number] & Record<string, unknown>;
interface RankingEntry extends Entry {
  responseData: { rankings: RankingRow[] } & Record<string, unknown>;
}
/** a ranking answer with only the given rows of the fixture entry */
const only = (entry: RankingEntry, rows: unknown[]): Entry => ({
  ...entry,
  responseData: { ...entry.responseData, rankings: rows },
});
const rowOf = (entry: RankingEntry, entityId: number) => {
  const r = entry.responseData.rankings.find((x) => x.entityId === entityId);
  if (!r) throw new Error(`no row ${entityId}`);
  return r;
};

describe('great buildings from the ranking window', () => {
  it('stores every foreign building of the page the tab opens with, with level, progress, costs and tier', async () => {
    const { greatBuildings, send } = setup();
    send(ranking.opened as Entry);
    const rows = await greatBuildings.known();
    expect(rows).toHaveLength(17);
    const byId = (id: number) => rows.find((r) => r.entityId === id);
    expect(byId(3475)).toEqual({
      world: expect.anything(),
      owner: playerId(2001),
      entityId: 3475,
      cityEntityId: buildingDefId('X_FutureEra_Landmark1'),
      level: 137,
      // `points` is missing at 0
      invested: 0,
      required: 22879,
      tier: 'copper',
      seenAt: 5_000,
    });
    expect(byId(4854)).toMatchObject({ owner: playerId(2013), invested: 18987, required: 19577, tier: 'gold' });
  });

  it('skips the own building', async () => {
    const { greatBuildings, send } = setup();
    send(ranking.opened as Entry);
    expect(await greatBuildings.known(playerId(1000))).toEqual([]);
  });

  it('stores the rows of a page and of both searches', async () => {
    const { greatBuildings, send } = setup();
    send(ranking.page as Entry);
    send(ranking.playerSearch as Entry);
    send(ranking.buildingSearch as Entry);
    expect(await greatBuildings.known()).toHaveLength(4 + 6 + 6);
    expect(await greatBuildings.known(playerId(2021))).toHaveLength(5);
  });

  it('leaves the other categories alone', async () => {
    const { greatBuildings, players, send, events } = setup();
    send(ranking.medals as Entry);
    await greatBuildings.known();
    expect(await greatBuildings.known()).toEqual([]);
    expect(players.get(playerId(2029))).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('names each owner once its rows are written, and does not announce a list', async () => {
    const { greatBuildings, send, events } = setup();
    send(ranking.playerSearch as Entry);
    await greatBuildings.known();
    expect(events).toEqual(['stored:2021:1391,6749,8734,4797,802 2022:4205']);
  });

  it('teaches the player store each owner with name, era and guild', () => {
    const { players, send } = setup();
    send(ranking.opened as Entry);
    expect(players.get(playerId(2001))).toMatchObject({
      name: 'Spieler 2001',
      avatar: 'portrait_id_1',
      cityName: 'Stadt 2001',
      era: 'SpaceAgeJupiterMoon',
      guild: { id: guildId(3001), name: 'Gilde 3001' },
      relations: { neighbor: false, guildMember: false, friend: false },
      source: 'list',
    });
    // a clan without an id: no guild
    expect(players.get(playerId(2004))?.guild).toBeUndefined();
    expect(players.get(playerId(1000))).toBeUndefined();
  });

  it('drops the guild of a known player whose clan has no id', () => {
    const { players, send } = setup();
    send(ranking.opened as Entry);
    const row = rowOf(ranking.opened as RankingEntry, 3475);
    send(
      only(ranking.opened as RankingEntry, [
        { ...row, clan: { description: '', __class__: 'Clan' }, player: { ...row.player, clan_id: undefined } },
      ]),
    );
    expect(players.get(playerId(2001))?.guild).toBeUndefined();
  });

  it('teaches the catalog the names of the buildings', () => {
    const { catalog, send } = setup();
    send(ranking.buildingSearch as Entry);
    expect(catalog.greatBuildingName(buildingDefId('X_FutureEra_Landmark1'))).toBe('Die Arche');
  });

  it('writes like a list: a newer row with a new level drops the rankings and keeps the star', async () => {
    const { greatBuildings, send, at } = setup();
    const o = fixture.openings[0] as { entity: Entry; construction: Entry };
    send(o.entity, o.construction);
    const [opened] = await greatBuildings.known();
    if (!opened) throw new Error('nothing opened');
    await greatBuildings.flag('marked', opened.owner, opened.entityId, true);
    at(6_000);
    const row = rowOf(ranking.opened as RankingEntry, 3475);
    send(
      only(ranking.opened as RankingEntry, [
        {
          ...row,
          player: { ...row.player, player_id: opened.owner },
          entityId: opened.entityId,
          cityEntityId: opened.cityEntityId,
          level: opened.level + 1,
          points: 7,
        },
      ]),
    );
    const [b] = await greatBuildings.known(opened.owner);
    expect(b).toMatchObject({ level: opened.level + 1, invested: 7, tier: 'copper', marked: true, seenAt: 6_000 });
    expect(b?.rankings).toBeUndefined();
    expect(b?.maxLevel).toBe(opened.maxLevel);
  });

  it('ignores a row that is not newer than the entry', async () => {
    const { greatBuildings, send } = setup();
    send(ranking.page as Entry);
    const row = rowOf(ranking.page as RankingEntry, 3831);
    send(only(ranking.page as RankingEntry, [{ ...row, level: 200 }]));
    expect((await greatBuildings.known(playerId(2018)))[0]).toMatchObject({ level: 137 });
  });
});

describe('the tier of a building', () => {
  it('stays when a list or an opening that does not know it writes the building', async () => {
    const { greatBuildings, send, at } = setup();
    const o = fixture.openings[0] as { entity: Entry; construction: Entry };
    send(o.entity, o.construction);
    const [opened] = await greatBuildings.known();
    if (!opened) throw new Error('nothing opened');
    at(6_000);
    const row = rowOf(ranking.page as RankingEntry, 3831);
    send(
      only(ranking.page as RankingEntry, [
        {
          ...row,
          player: { ...row.player, player_id: opened.owner },
          entityId: opened.entityId,
          cityEntityId: opened.cityEntityId,
          level: opened.level,
          points: opened.invested,
        },
      ]),
    );
    expect((await greatBuildings.known(opened.owner))[0]?.tier).toBe('gold');
    // a list of the owner
    at(7_000);
    send({
      requestClass: 'GreatBuildingsService',
      requestMethod: 'getOtherPlayerOverview',
      requestData: [opened.owner],
      responseData: [
        {
          entity_id: opened.entityId,
          city_entity_id: opened.cityEntityId,
          name: 'x',
          level: opened.level,
          current_progress: opened.invested + 5,
          max_progress: opened.required,
          player: { player_id: opened.owner, name: 'x' },
        },
      ],
    });
    expect((await greatBuildings.known(opened.owner))[0]).toMatchObject({
      invested: opened.invested + 5,
      tier: 'gold',
    });
    // the building opened again
    at(8_000);
    send(o.entity, o.construction);
    expect((await greatBuildings.known(opened.owner))[0]).toMatchObject({ seenAt: 8_000, tier: 'gold' });
  });

  it('follows a newer ranking row', async () => {
    const { greatBuildings, send, at } = setup();
    const row = rowOf(ranking.page as RankingEntry, 3831);
    send(only(ranking.page as RankingEntry, [{ ...row, currentTier: { ...row.currentTier, value: 'copper' } }]));
    at(6_000);
    send(only(ranking.page as RankingEntry, [row]));
    expect((await greatBuildings.known(playerId(2018)))[0]?.tier).toBe('gold');
  });
});

describe('rows and owners the ranking does not fully name', () => {
  it('skips a row without costs and learns no owner without a name, nor a building name that is missing', async () => {
    const { greatBuildings, players, catalog, send } = setup();
    const row = rowOf(ranking.opened as RankingEntry, 3475);
    const { requiredPoints: _, ...withoutCosts } = row;
    const { name: __, ...unnamed } = { ...row, entityId: 1, player: { ...row.player, name: '' } };
    send(
      only(ranking.opened as RankingEntry, [
        { ...row, player: { ...row.player, player_id: 2002 } },
        withoutCosts,
        unnamed,
      ]),
    );
    expect((await greatBuildings.known()).map((b) => b.entityId).sort()).toEqual([1, 3475]);
    expect(players.get(playerId(2001))).toBeUndefined();
    expect(catalog.greatBuildingName(buildingDefId('X_FutureEra_Landmark1'))).toBe('Die Arche');
  });

  it('reads only the tab of the great buildings', async () => {
    const { greatBuildings, send } = setup();
    const medals = ranking.medals as Entry & { responseData: Record<string, unknown> };
    send({ ...medals, responseData: { ...medals.responseData, rankings: ranking.page.responseData.rankings } });
    expect(await greatBuildings.known()).toEqual([]);
  });

  it('stores no tier it does not know', async () => {
    const { greatBuildings, send } = setup();
    const row = rowOf(ranking.page as RankingEntry, 3831);
    send(only(ranking.page as RankingEntry, [{ ...row, currentTier: { value: 'diamond' } }]));
    expect((await greatBuildings.known())[0]).not.toHaveProperty('tier');
  });

  it('keeps what a known player has when the ranking leaves it out, and the flag of the same guild', () => {
    const { players, send, world } = setup();
    players.apply(
      world,
      [
        {
          id: playerId(2001),
          name: 'Alt',
          avatar: 'a',
          cityName: 'Altstadt',
          era: eraId('IronAge'),
          active: true,
          guild: { id: guildId(3001), name: 'Alt', flag: 'flag_1' },
        },
      ],
      'visit',
    );
    const row = rowOf(ranking.opened as RankingEntry, 3475);
    send(only(ranking.opened as RankingEntry, [{ ...row, player: { player_id: 2001, name: 'Neu' } }]));
    expect(players.get(playerId(2001))).toMatchObject({
      name: 'Neu',
      avatar: 'a',
      cityName: 'Altstadt',
      era: 'IronAge',
      guild: { id: guildId(3001), name: 'Gilde 3001', flag: 'flag_1' },
    });
  });

  it('redraws the views when only the era of a known owner changed', () => {
    const { players, send, bus } = setup();
    send(ranking.opened as Entry);
    const updated: unknown[] = [];
    bus.on('player.updated', (e) => updated.push(e.ids));
    const row = rowOf(ranking.opened as RankingEntry, 3475);
    send(only(ranking.opened as RankingEntry, [{ ...row, player: { ...row.player, era: 'IronAge' } }]));
    expect(players.get(playerId(2001))?.era).toBe('IronAge');
    expect(updated).toEqual([[playerId(2001)]]);
  });
});
