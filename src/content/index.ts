// Content script entry: wires stores, ingestion and features, then connects to the proxy.

import { worldId } from '../shared/ids';
import { watchArmyTarget, windowArmyLink } from './core/army-target';
import { createBus } from './core/events';
import { extensionAlive, onExtensionLost } from './core/extension-context';
import { boxFactory, type Feature, type FeatureContext } from './core/feature';
import { Ingestion } from './core/ingestion';
import { chromeLocal } from './core/kv';
import { logError } from './core/log';
import { windowMarkerLink } from './core/marker-link';
import { Markers } from './core/markers';
import { connectProxy } from './core/proxy-link';
import { Recorder } from './core/recorder';
import { callBackground } from './core/rpc';
import { OwnSelection } from './core/selection';
import { Settings } from './core/settings';
import { t } from './core/texts';
import { buildingSearchFeature } from './features/building-search';
import { cityMapFeature } from './features/city-map';
import { foestatsFeature } from './features/foestats';
import { gbCalculatorFeature } from './features/gb-calculator';
import { gbOwnShareFeature } from './features/gb-own-share';
import { gbPowerLevelFeature } from './features/gb-power-level';
import { investmentsFeature } from './features/investments';
import { notesFeature } from './features/notes';
import { pvpFeature } from './features/pvp';
import { sabotageFeature } from './features/sabotage';
import { settingsFeature } from './features/settings-feature';
import { registerGameHandlers } from './game/handlers';
import { createStores } from './stores';
import { createGbOwnState } from './stores/gb-own-state';
import { Menu } from './ui/menu';
import { UiState } from './ui/ui-state';

const features: Feature[] = [
  sabotageFeature,
  pvpFeature,
  notesFeature,
  cityMapFeature,
  buildingSearchFeature,
  gbCalculatorFeature,
  gbOwnShareFeature,
  gbPowerLevelFeature,
  investmentsFeature,
  foestatsFeature,
  settingsFeature,
];

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
    stores.greatBuildings.load().catch((e) => logError('loading the time of the town hall list failed', e)),
  ]);

  const markers = new Markers(bus, stores.cities, windowMarkerLink);
  watchArmyTarget(bus, windowArmyLink);
  const ctx: FeatureContext = {
    world,
    bus,
    settings,
    menu,
    ...stores,
    recorder,
    markers,
    selection: new OwnSelection(bus, stores.cities, stores.catalog, markers),
    ui,
    gbOwn: createGbOwnState(bus, ui, settings),
    createBox: boxFactory(ui, (group) => bus.emit('settings.open', { group })),
  };
  for (const feature of features) {
    try {
      feature.setup(ctx);
    } catch (error) {
      logError(`feature ${feature.id} failed to start`, error);
    }
  }

  // a sideways two-finger swipe on a Mac trackpad that runs past a box would otherwise navigate back and leave the game
  document.documentElement.style.overscrollBehaviorX = 'none';

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
