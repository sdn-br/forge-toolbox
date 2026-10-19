// Content script entry: wires stores, ingestion and features, then connects to the proxy.
import { worldId } from '../shared/ids';
import { createBus } from './core/events';
import { boxFactory, type Feature, type FeatureContext } from './core/feature';
import { Ingestion } from './core/ingestion';
import { chromeLocal } from './core/kv';
import { logError } from './core/log';
import { connectProxy } from './core/proxy-link';
import { Recorder } from './core/recorder';
import { callBackground } from './core/rpc';
import { Settings } from './core/settings';
import { pvpFeature } from './features/pvp';
import { sabotageFeature } from './features/sabotage';
import { settingsFeature } from './features/settings-feature';
import { registerGameHandlers } from './game/handlers';
import { BattleStore, battlePersistence } from './stores/battles';
import { CatalogStore } from './stores/catalog';
import { CityStore } from './stores/cities';
import { PlayerStore } from './stores/players';
import { SessionStore } from './stores/session';
import { Menu } from './ui/menu';
import { UiState } from './ui/ui-state';

const features: Feature[] = [sabotageFeature, pvpFeature, settingsFeature];

async function main() {
  const world = worldId(location.hostname.split('.')[0] ?? 'unknown');
  const now = Date.now;
  const bus = createBus();
  const ingestion = new Ingestion();
  const settings = new Settings(chromeLocal);
  const ui = new UiState(chromeLocal);
  const session = new SessionStore(bus);
  const players = new PlayerStore(bus, {
    load: (w) => callBackground('players.load', { world: w }),
    put: (rows) => callBackground('players.put', { rows }),
  });
  const battles = new BattleStore(bus, world, battlePersistence(callBackground));
  const cities = new CityStore(bus);
  const catalog = new CatalogStore(bus);
  const recorder = new Recorder(() => settings.get('core.record'));
  const menu = new Menu();

  registerGameHandlers(ingestion, { world, now, session, players, cities, catalog, battles });
  // the proxy buffers game traffic until we connect, so loading first loses nothing
  await Promise.all([
    settings.load(),
    ui.load(),
    players.load(world).catch((e) => logError('loading players failed', e)),
  ]);

  const ctx: FeatureContext = {
    world,
    bus,
    settings,
    menu,
    session,
    players,
    cities,
    catalog,
    battles,
    recorder,
    createBox: boxFactory(ui),
  };
  for (const feature of features) {
    try {
      feature.setup(ctx);
    } catch (error) {
      logError(`feature ${feature.id} failed to start`, error);
    }
  }

  connectProxy((traffic) => {
    recorder.add(traffic);
    ingestion.accept(traffic);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => menu.mount());
  else menu.mount();
}

main().catch((error) => logError('start failed', error));
