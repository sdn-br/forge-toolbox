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

/**
 * service worker to the game tab of a profile: rows the backup holds changed; `change` is the profile's change number,
 * a copy written at that number is up to date
 */
export interface Persisted {
  type: 'forge-toolbox.persisted';
  profile: Profile;
  change: number;
}

export const persisted = (profile: Profile, change: number): Persisted => ({
  type: 'forge-toolbox.persisted',
  profile,
  change,
});

export function isPersisted(message: unknown): message is Persisted {
  const m = message as Partial<Persisted> | null;
  return m?.type === 'forge-toolbox.persisted' && isProfile(m.profile) && typeof m.change === 'number';
}

/** the state of the backup in a local folder in chrome.storage.local; the data page and the game tabs watch it */
export const FOLDER_STATUS = 'folder.status';

export interface FolderStatus {
  /** when a file was written last */
  lastWrite?: number;
  /** a write found no permission: the user has to grant the folder again on the data page */
  paused: boolean;
  /** the profiles that wait for a write since the backup paused */
  pending: Profile[];
}

/** content script to service worker: merge and write the folder at the start of the game, or write after a change */
export interface FolderRequest {
  type: 'forge-toolbox.folder';
  action: 'start' | 'changed';
  profile: Profile;
}

export const folderRequest = (action: FolderRequest['action'], profile: Profile): FolderRequest => ({
  type: 'forge-toolbox.folder',
  action,
  profile,
});

export function isFolderRequest(message: unknown): message is FolderRequest {
  const m = message as Partial<FolderRequest> | null;
  return m?.type === 'forge-toolbox.folder' && (m.action === 'start' || m.action === 'changed') && isProfile(m.profile);
}

/** data page to service worker: a folder was chosen, merge what it holds and write every profile */
export const FOLDER_CHOSEN = 'forge-toolbox.folderChosen';
/** data page to service worker: the folder may be written again, write the profiles that waited */
export const FOLDER_GRANTED = 'forge-toolbox.folderGranted';
