import type { WorldId } from './ids';
import { isProfile, type Profile } from './profile';

/** content script to service worker: open the extension page "Daten verwalten" */
export const OPEN_DATA_PAGE = 'forge-toolbox.openDataPage';

/** data page to service worker, and service worker to every open game tab: an import changed these profiles */
export interface DataImported {
  type: 'forge-toolbox.dataImported';
  profiles: Profile[];
}

export const dataImported = (profiles: Profile[]): DataImported => ({ type: 'forge-toolbox.dataImported', profiles });

export function isDataImported(message: unknown): message is DataImported {
  const m = message as Partial<DataImported> | null;
  return m?.type === 'forge-toolbox.dataImported' && Array.isArray(m.profiles) && m.profiles.every(isProfile);
}

/** whether the import touched the tab's profile; before the startup data the tab knows only its world */
export function importConcerns(profiles: Profile[], world: WorldId, own: Profile | undefined): boolean {
  return profiles.some((p) => p.world === world && (own === undefined || p.player === own.player));
}
