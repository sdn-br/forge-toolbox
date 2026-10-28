import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLDER_START_WAIT, folderLink, watchFolderPause } from '../src/content/core/folder-link';
import type { FolderStatus } from '../src/shared/messages';
import { me } from './helpers/backup';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the start of the game with a backup folder', () => {
  it('waits for the merge of the profile', async () => {
    const sent: unknown[] = [];
    let answer = () => {};
    const link = folderLink(me, (message) => {
      sent.push(message);
      return new Promise<void>((resolve) => {
        answer = resolve;
      });
    });
    let started = false;
    const start = link.start().then(() => {
      started = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(started).toBe(false);
    answer();
    await start;
    expect(sent).toEqual([{ type: 'forge-toolbox.folder', action: 'start', profile: me }]);
  });

  it('stops waiting after a while, so a slow folder does not hold the game', async () => {
    const link = folderLink(me, () => new Promise(() => {}));
    let started = false;
    link.start().then(() => {
      started = true;
    });
    await vi.advanceTimersByTimeAsync(FOLDER_START_WAIT);
    expect(started).toBe(true);
  });
});

describe('the line about the paused backup', () => {
  it('shows while paused and hides once written again', async () => {
    const shown: boolean[] = [];
    let change: (status: FolderStatus | undefined) => void = () => {};
    await watchFolderPause({
      read: async () => ({ paused: true, pending: [me] }),
      onChange: (fn) => {
        change = fn;
      },
      show: () => shown.push(true),
      hide: () => shown.push(false),
    });
    change({ paused: false, pending: [], lastWrite: 1 });
    change(undefined);
    expect(shown).toEqual([true, false, false]);
  });
});
