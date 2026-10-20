// Content script entry: wires stores, ingestion and features, then connects to the proxy.

import { battlePersistence } from '../persistence/battles/client';
import { incomingPersistence } from '../persistence/incoming/client';
import { notePersistence } from '../persistence/notes/client';
import { playerPersistence } from '../persistence/players/client';
import { plunderPersistence } from '../persistence/plunders/client';
import { worldId } from '../shared/ids';
import { createBus } from './core/events';
import { extensionAlive, onExtensionLost } from './core/extension-context';
import { boxFactory, type Feature, type FeatureContext } from './core/feature';
import { Ingestion } from './core/ingestion';
import { chromeLocal } from './core/kv';
import { logError } from './core/log';
import { connectProxy } from './core/proxy-link';
import { Recorder } from './core/recorder';
import { callBackground } from './core/rpc';
import { Settings } from './core/settings';
import { t } from './core/texts';
import { pvpFeature } from './features/pvp';
import { sabotageFeature } from './features/sabotage';
import { settingsFeature } from './features/settings-feature';
import { registerGameHandlers } from './game/handlers';
import { BattleStore } from './stores/battles';
import { CatalogStore } from './stores/catalog';
import { CityStore } from './stores/cities';
import { IncomingStore } from './stores/incoming';
import { NoteStore } from './stores/notes';
import { PlayerStore } from './stores/players';
import { PlunderStore } from './stores/plunders';
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
  const players = new PlayerStore(bus, playerPersistence(callBackground));
  const battles = new BattleStore(bus, world, battlePersistence(callBackground));
  const plunders = new PlunderStore(bus, world, plunderPersistence(callBackground));
  const incoming = new IncomingStore(bus, world, incomingPersistence(callBackground));
  const notes = new NoteStore(bus, world, notePersistence(callBackground));
  const cities = new CityStore(bus);
  const catalog = new CatalogStore(bus);
  const recorder = new Recorder(
    () => settings.get('core.record'),
    () => settings.get('core.recordRequests'),
  );
  const menu = new Menu();

  registerGameHandlers(ingestion, { world, now, session, players, cities, catalog, battles, plunders, incoming });
  // the proxy buffers game traffic until we connect, so loading first loses nothing
  await Promise.all([
    settings.load(),
    ui.load(),
    players.load(world).catch((e) => logError('loading players failed', e)),
    notes.load().catch((e) => logError('loading notes failed', e)),
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
    plunders,
    incoming,
    notes,
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

  onExtensionLost(() => menu.showNotice(t('core.extensionLost')));
  connectProxy((traffic) => {
    // without the extension nothing can be saved; the notice asks for a reload instead of failing on every message
    if (!extensionAlive()) return;
    recorder.add(traffic);
    ingestion.accept(traffic);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => menu.mount());
  else menu.mount();
}

main().catch((error) => logError('start failed', error));
