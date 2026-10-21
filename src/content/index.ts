// Content script entry: wires stores, ingestion and features, then connects to the proxy.

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
import { cityMapFeature } from './features/city-map';
import { notesFeature } from './features/notes';
import { pvpFeature } from './features/pvp';
import { sabotageFeature } from './features/sabotage';
import { settingsFeature } from './features/settings-feature';
import { registerGameHandlers } from './game/handlers';
import { createStores } from './stores';
import { Menu } from './ui/menu';
import { UiState } from './ui/ui-state';

const features: Feature[] = [sabotageFeature, pvpFeature, notesFeature, cityMapFeature, settingsFeature];

async function main() {
  const world = worldId(location.hostname.split('.')[0] ?? 'unknown');
  const now = Date.now;
  const bus = createBus();
  const ingestion = new Ingestion();
  const settings = new Settings(chromeLocal);
  const ui = new UiState(chromeLocal);
  const stores = createStores(world, bus, callBackground, now);
  const recorder = new Recorder(
    () => settings.get('core.record'),
    () => settings.get('core.recordRequests'),
  );
  const menu = new Menu();

  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  // the proxy buffers game traffic until we connect, so loading first loses nothing
  await Promise.all([
    settings.load(),
    ui.load(),
    stores.players.load(world).catch((e) => logError('loading players failed', e)),
    stores.notes.load().catch((e) => logError('loading notes failed', e)),
  ]);

  const ctx: FeatureContext = {
    world,
    bus,
    settings,
    menu,
    ...stores,
    recorder,
    ui,
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
