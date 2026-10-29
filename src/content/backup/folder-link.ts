// The game's side of the backup in a local folder: the service worker reads and writes the folder and writes it on its
// own after a change; the game has it merged at the start and shows a line next to the menu while the backup waits for
// the folder to be granted again.
import { type FolderStatus, folderRequest } from '../../shared/messages';
import type { Profile } from '../../shared/profile';
import { logError } from '../core/log';

/** how long the start of the game waits for the merge with the folder; the startup gate holds the game meanwhile */
export const FOLDER_START_WAIT = 5_000;

export interface FolderLink {
  /** merges the folder into the profile before the stores load; gives up waiting after `FOLDER_START_WAIT` */
  start(): Promise<void>;
}

export function folderLink(profile: Profile, send: (message: unknown) => Promise<unknown>): FolderLink {
  return {
    start: () => {
      const merged = send(folderRequest('start', profile)).catch((error) =>
        logError('merging the backup folder failed', error),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waited = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, FOLDER_START_WAIT);
      });
      // the timer must not outlive the race: it would keep a dead promise and a pending callback for 5 s
      return Promise.race([merged, waited]).then(() => clearTimeout(timer));
    },
  };
}

/** what the line about the paused backup needs: the stored status, its changes and the line */
export interface PauseEnv {
  read(): Promise<FolderStatus | undefined>;
  onChange(fn: (status: FolderStatus | undefined) => void): void;
  show(): void;
  hide(): void;
}

/** Shows the line while the backup is paused and hides it once a write went through again. */
export function watchFolderPause(env: PauseEnv): Promise<void> {
  const apply = (status: FolderStatus | undefined) => (status?.paused ? env.show() : env.hide());
  env.onChange(apply);
  return env.read().then(apply);
}
