import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { GreatBuildingStore } from '../src/content/stores/great-buildings';
import { applyListRow, hasOwnContribution } from '../src/persistence/great-buildings/merge';
import { playerId, worldId } from '../src/shared/ids';
import type { KnownGreatBuilding } from '../src/shared/model';
import contributionFixture from './fixtures/gb-contribution.json';
import contributions from './fixtures/gb-contributions.json';
import levelUp from './fixtures/gb-level-up.json';
import fixture from './fixtures/great-buildings.json';
import { testStores } from './helpers/stores';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

const DAY = 24 * 60 * 60 * 1000;

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
  send(...(fixture.startup as Entry[]));
  const open = (entityId: number) => {
    const o = fixture.openings.find((x) => x.entity.requestData[0] === entityId);
    if (!o) throw new Error(`no opening ${entityId}`);
    send(o.entity as Entry);
    send(o.construction as Entry);
  };
  const list = (rows: unknown[], owner = 1001) =>
    send({
      requestClass: 'GreatBuildingsService',
      requestMethod: 'getOtherPlayerOverview',
      requestData: [owner],
      responseData: rows,
    });
  const row = (entityId: number, level: number, current: number | undefined, required: number, owner = 1001) => ({
    entity_id: entityId,
    city_entity_id: 'X_EarlyMiddleAge_Landmark2',
    name: 'Aachener Dom',
    level,
    ...(current !== undefined && { current_progress: current }),
    max_progress: required,
    player: { player_id: owner, name: 'x' },
  });
  return {
    ...stores,
    db,
    world,
    bus,
    send,
    open,
    list,
    row,
    at: (t: number) => {
      clock = t;
    },
  };
}

const known = (over: Partial<KnownGreatBuilding> = {}): KnownGreatBuilding => ({
  world: worldId('de20'),
  owner: playerId(1001),
  entityId: 1,
  cityEntityId: 'X' as KnownGreatBuilding['cityEntityId'],
  level: 5,
  invested: 100,
  required: 500,
  seenAt: 1_000,
  ...over,
});

describe('known great buildings from lists', () => {
  it('keeps the rankings with their level, time and sum when a building is opened', async () => {
    const { greatBuildings, open } = setup();
    open(1909);
    const [b] = await greatBuildings.known(playerId(1001));
    expect(b).toMatchObject({
      level: 75,
      maxLevel: 76,
      connected: true,
      rankingsLevel: 75,
      rankingsAt: 5_000,
      rankingsInvested: 251,
    });
    expect(b?.rankings?.[0]).toMatchObject({ player: 1001, fp: 251 });
    expect(b?.ownContribution).toBeUndefined();
  });

  it('writes a list of another player and leaves what a list does not bring', async () => {
    const { greatBuildings, send, at } = setup();
    at(7_000);
    send(levelUp.overview as Entry);
    const rows = (await greatBuildings.known(playerId(1001))).sort((a, b) => b.entityId - a.entityId);
    expect(rows.map((r) => [r.entityId, r.level, r.invested, r.required, r.seenAt])).toEqual([
      [852, 8, 0, 450, 7_000],
      [829, 9, 10, 550, 7_000],
      [285, 10, 0, 667, 7_000],
    ]);
    expect(rows[0]?.rankings).toBeUndefined();
    expect(rows[0]?.maxLevel).toBeUndefined();
  });

  it('updates the numbers of a newer list and keeps the rankings of the same level', async () => {
    const { greatBuildings, open, list, row, at } = setup();
    open(1909);
    at(6_000);
    list([row(1909, 75, 300, 3062)]);
    const [b] = await greatBuildings.known(playerId(1001));
    expect(b).toMatchObject({ level: 75, invested: 300, seenAt: 6_000, rankingsInvested: 251, rankingsAt: 5_000 });
    expect(b?.rankings?.[0]).toMatchObject({ player: 1001, fp: 251 });
    expect(b?.maxLevel).toBe(76);
  });

  it('drops the rankings of a list with a new level, the entry stays', async () => {
    const { greatBuildings, open, list, row, at } = setup();
    open(1909);
    at(6_000);
    list([row(1909, 76, 0, 3100)]);
    const [b] = await greatBuildings.known(playerId(1001));
    expect(b).toMatchObject({ level: 76, invested: 0, required: 3100, seenAt: 6_000, maxLevel: 76 });
    expect(b?.rankings).toBeUndefined();
    expect(b?.rankingsLevel).toBeUndefined();
    expect(b?.rankingsAt).toBeUndefined();
    expect(b?.rankingsInvested).toBeUndefined();
  });

  it('ignores a list that is not newer than the entry', async () => {
    const { greatBuildings, open, list, row } = setup();
    open(1909);
    list([row(1909, 76, 0, 3100)]);
    expect((await greatBuildings.known(playerId(1001)))[0]).toMatchObject({ level: 75, invested: 251 });
  });

  it("flags a list of the open building's owner within 3 s of opening or paying in as asked by the game", () => {
    const { bus, open, list, row, at } = setup();
    const asked: string[] = [];
    bus.on('greatBuildings.listed', (e) => asked.push(`${e.owner}:${e.at}:${e.askedByGame}`));
    // 1909 of 1001 opened at 5 000
    open(1909);
    at(7_999);
    list([row(1909, 75, 300, 3062)]);
    at(8_000);
    list([row(1909, 75, 300, 3062)]);
    // another owner's list right after the opening is the player's own question
    at(5_500);
    list([row(650, 49, 917, 2000, 1002)], 1002);
    expect(asked).toEqual(['1001:7999:true', '1001:8000:false', '1002:5500:false']);
  });

  it('counts a list as asked by the player while no building is open', () => {
    const { bus, list, row, at } = setup();
    const asked: boolean[] = [];
    bus.on('greatBuildings.listed', (e) => asked.push(e.askedByGame));
    at(6_000);
    list([row(1909, 75, 300, 3062)]);
    expect(asked).toEqual([false]);
  });

  it('writes nothing for the own list', async () => {
    const { greatBuildings, list, row, at } = setup();
    at(6_000);
    list([row(1909, 75, 300, 3062, 1000)], 1000);
    expect(await greatBuildings.known()).toEqual([]);
  });

  it('keeps the own contribution mark when a building is opened again', async () => {
    const { greatBuildings, send, open } = setup();
    send(contributions.startup[0] as Entry);
    open(1909);
    expect((await greatBuildings.known())[0]?.ownContribution).toBeUndefined();
    const own = {
      ...contributions.contributions,
      responseData: [{ ...contributions.contributions.responseData[0], entity_id: 1909, player: { player_id: 1001 } }],
    };
    send(own as Entry);
    expect((await greatBuildings.known())[0]).toMatchObject({ entityId: 1909, ownContribution: true, level: 75 });
    open(1909);
    expect((await greatBuildings.known())[0]).toMatchObject({ ownContribution: true, level: 75, maxLevel: 76 });
  });
});

describe('own contribution list (getContributions)', () => {
  const rows = contributions.contributions.responseData;

  it('writes every row as an own contribution with level, sum and costs', async () => {
    const { greatBuildings, send, at } = setup();
    send(...(contributions.startup as Entry[]));
    at(8_000);
    send(contributions.contributions as Entry);
    const all = await greatBuildings.known();
    expect(all).toHaveLength(rows.length);
    expect(all.every((b) => b.ownContribution && b.seenAt === 8_000)).toBe(true);
    const first = rows[0];
    expect(all.find((b) => b.entityId === first?.entity_id)).toMatchObject({
      owner: first?.player.player_id,
      level: first?.level,
      invested: first?.current_progress,
      required: first?.max_progress,
    });
  });

  it('deletes own contributions that the list no longer has and keeps other buildings', async () => {
    const { greatBuildings, send, open, list, row } = setup();
    send(...(contributions.startup as Entry[]));
    open(1909);
    list([row(777, 3, 1, 90)]);
    send(contributions.contributions as Entry);
    send({
      ...contributions.contributions,
      responseData: rows.slice(0, 2),
    } as Entry);
    const ids = (await greatBuildings.known()).map((b) => b.entityId).sort((a, b) => a - b);
    expect(ids).toEqual([777, 1909, ...rows.slice(0, 2).map((r) => r.entity_id)].sort((a, b) => a - b));
  });

  it('keeps the time of the list in the database, so it survives a reload', async () => {
    const { greatBuildings, db, world, bus, send, at } = setup();
    expect(greatBuildings.contributionsAt()).toBeUndefined();
    send(...(contributions.startup as Entry[]));
    at(8_000);
    send(contributions.contributions as Entry);
    // known at once, without waiting for the database
    expect(greatBuildings.contributionsAt()).toBe(8_000);
    await greatBuildings.known();
    const reloaded = new GreatBuildingStore(bus, world, db.greatBuildings);
    expect(reloaded.contributionsAt()).toBeUndefined();
    await reloaded.load();
    expect(reloaded.contributionsAt()).toBe(8_000);
  });

  it('keeps a list that arrives while the time from before the reload is read', async () => {
    const { greatBuildings, db, world, bus, send, at } = setup();
    send(...(contributions.startup as Entry[]));
    at(8_000);
    send(contributions.contributions as Entry);
    await greatBuildings.known();
    const reloaded = new GreatBuildingStore(bus, world, db.greatBuildings, () => 9_000);
    const loading = reloaded.load();
    reloaded.noteContributions([]);
    await loading;
    expect(reloaded.contributionsAt()).toBe(9_000);
  });

  it('does not take the own city for a foreign building', async () => {
    const { greatBuildings, send } = setup();
    send(...(contributions.startup as Entry[]));
    send({
      ...contributions.contributions,
      responseData: rows.map((r) => ({ ...r, player: { ...r.player, player_id: 1000 } })),
    } as Entry);
    expect(await greatBuildings.known()).toEqual([]);
  });
});

describe('own contribution and progress at the last opening', () => {
  const rows = contributions.contributions.responseData;

  it('keeps rank, own deposit and net reward of each town hall row with the time of the list', async () => {
    const { greatBuildings, send, at } = setup();
    send(...(contributions.startup as Entry[]));
    at(8_000);
    send(contributions.contributions as Entry);
    const first = rows[0];
    const b = (await greatBuildings.known()).find((x) => x.entityId === first?.entity_id);
    expect(b?.contribution).toEqual({ rank: 5, forgePoints: 50, reward: 25, at: 8_000 });
    // never opened: growth counts from the first town hall list
    expect(b?.growthBase).toBe(first?.current_progress);
  });

  it('counts growth from the first town hall list until the building is opened', async () => {
    const { greatBuildings, send, at } = setup();
    send(...(contributions.startup as Entry[]));
    const first = rows[0] as (typeof rows)[number];
    const listed = (progress: number, level = first.level) =>
      send({
        ...contributions.contributions,
        responseData: [{ ...first, level, current_progress: progress }],
      } as Entry);
    at(8_000);
    listed(24_602);
    at(9_000);
    listed(25_000);
    const known = async () => (await greatBuildings.known()).find((x) => x.entityId === first.entity_id);
    expect(await known()).toMatchObject({ invested: 25_000, growthBase: 24_602 });
    // a new level starts the count anew
    at(10_000);
    listed(100, first.level + 1);
    expect(await known()).toMatchObject({ invested: 100, growthBase: 100 });
  });

  it('tells when the town hall list came', () => {
    const { bus, send, at } = setup();
    const seen: number[] = [];
    bus.on('greatBuildings.contributions', ({ at: t }) => seen.push(t));
    send(...(contributions.startup as Entry[]));
    at(8_000);
    send(contributions.contributions as Entry);
    expect(seen).toEqual([8_000]);
  });

  it('takes the own place from an opened building and remembers its progress', async () => {
    const { greatBuildings, send, at } = setup();
    send(...(contributionFixture.startup as Entry[]));
    at(9_000);
    for (const e of contributionFixture.opening as Entry[]) send(e);
    const [b] = await greatBuildings.known();
    const mine = contributionFixture.opening[1]?.responseData as { rankings: { player?: { is_self?: boolean } }[] };
    expect(mine.rankings.some((r) => r.player?.is_self)).toBe(false);
    expect(b?.contribution).toBeUndefined();
    expect(b?.growthBase).toBe(1455);
  });

  it('takes the own place of an own contribution and the progress after it', async () => {
    const { greatBuildings, send, at } = setup();
    send(...(contributionFixture.startup as Entry[]));
    for (const e of contributionFixture.opening as Entry[]) send(e);
    at(9_500);
    send(...(contributionFixture.contribution as Entry[]));
    const [b] = await greatBuildings.known();
    expect(b?.contribution).toEqual({ rank: 2, forgePoints: 301, reward: 255, at: 9_500 });
    expect(b?.growthBase).toBe(1756);
  });

  it('keeps the progress of the last opening when the town hall list brings a newer one', async () => {
    const { greatBuildings, send, at } = setup();
    send(...(contributionFixture.startup as Entry[]));
    for (const e of contributionFixture.opening as Entry[]) send(e);
    send(...(contributionFixture.contribution as Entry[]));
    at(20_000);
    send({
      ...contributions.contributions,
      responseData: [
        {
          ...rows[0],
          entity_id: 222,
          level: 63,
          current_progress: 1800,
          max_progress: 3000,
          player: { player_id: 1001 },
        },
      ],
    } as Entry);
    const [b] = await greatBuildings.known();
    expect(b).toMatchObject({ invested: 1800, growthBase: 1756 });
    expect(b?.contribution).toEqual({ rank: 5, forgePoints: 50, reward: 25, at: 20_000 });
  });

  it('drops the own place and the progress of the last opening when a list brings a new level', async () => {
    const { greatBuildings, send, list, row, at } = setup();
    send(...(contributions.startup as Entry[]));
    send({
      ...contributions.contributions,
      responseData: [{ ...rows[0], entity_id: 1, level: 5, player: { player_id: 1001 } }],
    } as Entry);
    at(30_000);
    list([row(1, 6, 0, 900)]);
    const [b] = await greatBuildings.known();
    expect(b?.level).toBe(6);
    expect(b?.contribution).toBeUndefined();
  });
});

describe('growth between the last two sightings', () => {
  const opening = fixture.openings.find((x) => x.entity.requestData[0] === 1909) as (typeof fixture.openings)[number];
  /** the opened building as the game reports it again while it is open, with other Forge points paid in */
  const entityWith = (invested: number) =>
    ({
      ...opening.entity,
      responseData: {
        ...opening.entity.responseData,
        state: { ...opening.entity.responseData.state, invested_forge_points: invested },
      },
    }) as Entry;
  const repeatedRanking = () =>
    ({
      requestClass: 'GreatBuildingsService',
      requestMethod: 'getConstructionRanking',
      requestData: [1909, 1001, 76],
      responseData: opening.construction.responseData.rankings,
    }) as Entry;

  it('keeps what a newer list of the same level adds and replaces it with the next one', async () => {
    const { greatBuildings, list, row, at } = setup();
    list([row(1909, 75, 400, 2000)]);
    expect((await greatBuildings.known())[0]?.growth).toBeUndefined();
    at(6_000);
    list([row(1909, 75, 700, 2000)]);
    expect((await greatBuildings.known())[0]?.growth).toBe(300);
    at(7_000);
    list([row(1909, 75, 750, 2000)]);
    expect((await greatBuildings.known())[0]?.growth).toBe(50);
    at(8_000);
    list([row(1909, 75, 750, 2000)]);
    expect((await greatBuildings.known())[0]?.growth).toBeUndefined();
  });

  it('leaves the growth to an older list and drops it with a new level', async () => {
    const { greatBuildings, list, row, at } = setup();
    list([row(1909, 75, 400, 2000)]);
    at(6_000);
    list([row(1909, 75, 700, 2000)]);
    at(5_500);
    list([row(1909, 75, 500, 2000)]);
    expect((await greatBuildings.known())[0]).toMatchObject({ invested: 700, growth: 300 });
    at(7_000);
    list([row(1909, 76, 900, 3100)]);
    expect((await greatBuildings.known())[0]?.growth).toBeUndefined();
  });

  it('counts an opening and each change while it is open as a sighting', async () => {
    const { greatBuildings, list, row, open, send, at } = setup();
    at(4_000);
    list([row(1909, 75, 100, 3062)]);
    at(5_000);
    open(1909);
    expect((await greatBuildings.known())[0]?.growth).toBe(151);
    // the game repeats the rankings of the open level: nothing new was seen
    send(repeatedRanking());
    expect((await greatBuildings.known())[0]?.growth).toBe(151);
    send(entityWith(300));
    expect((await greatBuildings.known())[0]).toMatchObject({ invested: 300, growth: 49 });
  });

  it('shows nothing when an opening finds the progress unchanged', async () => {
    const { greatBuildings, list, row, open, at } = setup();
    at(4_000);
    list([row(1909, 75, 100, 3062)]);
    open(1909);
    expect((await greatBuildings.known())[0]?.growth).toBe(151);
    at(9_000);
    open(1909);
    expect((await greatBuildings.known())[0]?.growth).toBeUndefined();
  });

  it('drops the growth when an opening shows a new level', async () => {
    const { greatBuildings, list, row, open, at } = setup();
    at(3_000);
    list([row(1909, 74, 0, 2900)]);
    at(4_000);
    list([row(1909, 74, 100, 2900)]);
    expect((await greatBuildings.known())[0]?.growth).toBe(100);
    open(1909);
    expect((await greatBuildings.known())[0]).toMatchObject({ level: 75 });
    expect((await greatBuildings.known())[0]?.growth).toBeUndefined();
  });

  it('measures two writes of the same building in one batch one after the other', async () => {
    const { greatBuildings, db, world } = setup();
    const b = known({ world, entityId: 9, invested: 100 });
    await db.greatBuildings.put([b]);
    await db.greatBuildings.put([
      { ...b, invested: 160 },
      { ...b, invested: 160, again: true },
      { ...b, invested: 200, again: true },
    ]);
    const [stored] = await greatBuildings.known();
    expect(stored).toMatchObject({ invested: 200, growth: 40 });
    expect(stored).not.toHaveProperty('again');
  });
});

describe('retention', () => {
  it('prunes what was not seen for the given days, except own contributions', async () => {
    const { greatBuildings, send, open, list, row, at } = setup();
    send(...(contributions.startup as Entry[]));
    at(1_000);
    list([row(1, 3, 1, 90), row(2, 3, 1, 90)]);
    open(1909);
    send({
      ...contributions.contributions,
      responseData: [{ ...contributions.contributions.responseData[0], entity_id: 2, player: { player_id: 1001 } }],
    } as Entry);
    at(1_000 + 31 * DAY);
    await greatBuildings.prune(30);
    expect((await greatBuildings.known()).map((b) => b.entityId)).toEqual([2]);
  });

  it('keeps a building the session player holds a place in, by its stored rankings', () => {
    expect(hasOwnContribution(known())).toBe(false);
    expect(hasOwnContribution(known({ ownContribution: true }))).toBe(true);
    const mine = { rank: 2, name: 'Ich', self: true, fp: 10 };
    expect(hasOwnContribution(known({ rankings: [mine] }))).toBe(true);
    expect(hasOwnContribution(known({ rankings: [{ ...mine, rank: undefined }] }))).toBe(false);
  });
});

describe('applyListRow', () => {
  const r = { owner: playerId(1001), entityId: 1, cityEntityId: 'X' as never, level: 5, invested: 150, required: 500 };
  const w = worldId('de20');

  it('creates an entry without rankings', () => {
    expect(applyListRow(w, undefined, r, 2_000)).toEqual({ world: w, ...r, seenAt: 2_000 });
  });

  it('marks an older row as own contribution without touching its numbers, growth counting from them', () => {
    const old = known();
    expect(applyListRow(w, old, r, 500, true)).toEqual({ ...old, ownContribution: true, growthBase: old.invested });
    expect(applyListRow(w, old, r, 500)).toBeUndefined();
  });

  it('takes a row with an own rank as own contribution and does not store the rank', () => {
    expect(applyListRow(w, undefined, { ...r, rank: 3 }, 2_000)).toEqual({
      world: w,
      ...r,
      ownContribution: true,
      seenAt: 2_000,
    });
    const old = known();
    expect(applyListRow(w, old, { ...r, rank: 3 }, 500)).toEqual({ ...old, ownContribution: true });
  });
});
