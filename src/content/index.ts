// Content script entry: connects to the proxy at once, and once the startup data names the profile, wires its stores,
// ingestion and features, lets the held traffic through and shows the menu.

import { backupPersistence } from '../persistence/backup/client';
import { worldId } from '../shared/ids';
import { importConcerns, isDataImported } from '../shared/messages';
import type { Profile } from '../shared/profile';
import type { Traffic } from '../shared/proxy-protocol';
import { watchArmyTarget, windowArmyLink } from './core/army-target';
import { BackupCopy } from './core/backup-copy';
import { pageCopyStore } from './core/backup-store';
import { createBus } from './core/events';
import { extensionAlive, onExtensionLost, watchExtension } from './core/extension-context';
import { boxFactory, type Feature, type FeatureContext } from './core/feature';
import { Ingestion } from './core/ingestion';
import { chromeLocal, profileKv } from './core/kv';
import { LegacyData } from './core/legacy-data';
import { pageLegacyStore } from './core/legacy-store';
import { logError } from './core/log';
import { windowMarkerLink } from './core/marker-link';
import { Markers } from './core/markers';
import { chromeProfileStorage, profileCopy } from './core/profile-copy';
import { connectProxy } from './core/proxy-link';
import { Recorder } from './core/recorder';
import { backgroundCall } from './core/rpc';
import { OwnSelection } from './core/selection';
import { Settings } from './core/settings';
import { startupGate } from './core/startup-gate';
import { t } from './core/texts';
import { backupCopyFeature } from './features/backup-copy';
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
  backupCopyFeature,
];

/** Loads everything of the profile, starts the features and returns the receiver of the game traffic. */
async function start(profile: Profile, name: string, menu: Menu): Promise<(traffic: Traffic) => void> {
  const { world } = profile;
  const now = Date.now;
  const bus = createBus();
  const ingestion = new Ingestion();
  const kv = profileKv(chromeLocal, profile);
  // the list of profiles on the data page shows the own name, also without the game open
  kv.set('profile', { name, seenAt: now() }).catch((e) => logError('saving the profile name failed', e));
  const settings = new Settings(kv);
  const ui = new UiState(kv);
  const call = backgroundCall(profile);
  const stores = createStores(world, bus, call, now);
  const backupCopy = new BackupCopy({
    profile,
    name,
    bus,
    settings,
    kv,
    persistence: backupPersistence(call),
    store: pageCopyStore(),
    now,
    reload: () => location.reload(),
    legacy: new LegacyData({ profile, kv, persistence: backupPersistence(call), store: pageLegacyStore(), now }),
  });
  const recorder = new Recorder(
    () => settings.get('core.record'),
    () => settings.get('core.recordRequests'),
  );

  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  // the startup gate holds the game traffic until this returns, so loading first loses nothing
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
    profileCopy: profileCopy(chromeProfileStorage, profile, () => location.reload()),
    backupCopy,
  };
  for (const feature of features) {
    try {
      feature.setup(ctx);
    } catch (error) {
      logError(`feature ${feature.id} failed to start`, error);
    }
  }

  return (traffic) => {
    recorder.add(traffic);
    ingestion.accept(traffic);
  };
}

function main() {
  const world = worldId(location.hostname.split('.')[0] ?? 'unknown');
  const menu = new Menu();

  // a sideways two-finger swipe on a Mac trackpad that runs past a box would otherwise navigate back and leave the game
  document.documentElement.style.overscrollBehaviorX = 'none';

  onExtensionLost(() => {
    menu.showNotice(t('core.extensionLost'), [
      { label: t('core.reload'), action: () => location.reload() },
      { label: t('core.later'), action: () => menu.hideNotice() },
    ]);
    // lost before the startup data came, the profile never loads; the notice still has to show
    mountMenu();
  });
  watchExtension(2_000);
  let profile: Profile | undefined;
  // an import on the page "Daten verwalten" wrote past the stores this page holds in memory
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!isDataImported(message) || !importConcerns(message.profiles, world, profile)) return false;
    menu.showNotice(t('core.imported'), [
      { label: t('core.reload'), action: () => location.reload() },
      { label: t('core.later'), action: () => menu.hideNotice() },
    ]);
    return false;
  });
  const gate = startupGate(world, (started, name) => {
    profile = started;
    return start(started, name, menu);
  });
  // like the old toolbox, the menu shows once the features have seen the held traffic
  gate.started.then(mountMenu);
  // the proxy buffers game traffic until we connect; connecting at once lets the startup data name the profile
  connectProxy((traffic) => {
    // without the extension nothing can be saved; the notice asks for a reload instead of failing on every message
    if (!extensionAlive()) return;
    gate.receive(traffic);
  });

  function mountMenu() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => menu.mount());
    else menu.mount();
  }
}

try {
  main();
} catch (error) {
  logError('start failed', error);
}
