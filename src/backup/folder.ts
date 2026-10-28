// The local folder of the backup, chosen on the page "Daten verwalten" (File System Access). The page and the service
// worker share the folder's handle through the IndexedDB of the extension origin. The page grants the permission on a
// click; with "Bei jedem Besuch zulassen" Edge keeps it across restarts, and the service worker writes on its own.

/** The few calls the backup makes on a folder; `memoryFolder` stands in for it in tests. */
export interface Folder {
  readonly name: string;
  /** the names of the files directly in the folder */
  files(): Promise<string[]>;
  read(name: string): Promise<Blob>;
  /** creates the file or replaces its content */
  write(name: string, data: Blob): Promise<void>;
  remove(name: string): Promise<void>;
  /** the folder of that name inside, created when missing */
  subfolder(name: string): Promise<Folder>;
}

/** the chosen folder: may it be written without asking the user */
export interface RootFolder extends Folder {
  permission(): Promise<PermissionState>;
}

/** The parts of the File System Access API that TypeScript's DOM lib lacks. */
export interface FolderHandle extends FileSystemDirectoryHandle {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

/** The folder behind a handle of the File System Access API. */
export function handleFolder(handle: FolderHandle): RootFolder {
  return { ...directory(handle), permission: () => handle.queryPermission({ mode: 'readwrite' }) };
}

function directory(handle: FileSystemDirectoryHandle): Folder {
  return {
    name: handle.name,
    files: async () => {
      const names: string[] = [];
      for await (const entry of handle.values()) if (entry.kind === 'file') names.push(entry.name);
      return names;
    },
    read: async (name) => (await handle.getFileHandle(name)).getFile(),
    write: async (name, data) => {
      const writable = await (await handle.getFileHandle(name, { create: true })).createWritable();
      await writable.write(data);
      await writable.close();
    },
    remove: (name) => handle.removeEntry(name),
    subfolder: async (name) => directory(await handle.getDirectoryHandle(name, { create: true })),
  };
}

/** A folder in memory, for tests: `data` maps the file names to their contents, `folders` holds the subfolders. */
export interface MemoryFolder extends RootFolder {
  data: Map<string, Blob>;
  folders: Map<string, MemoryFolder>;
  granted: PermissionState;
}

export function memoryFolder(name = 'Sicherung'): MemoryFolder {
  const data = new Map<string, Blob>();
  const folders = new Map<string, MemoryFolder>();
  const folder: MemoryFolder = {
    name,
    data,
    folders,
    granted: 'granted',
    permission: async () => folder.granted,
    files: async () => [...data.keys()],
    read: async (file) => {
      const blob = data.get(file);
      if (!blob) throw new DOMException(`${file} not found`, 'NotFoundError');
      return blob;
    },
    write: async (file, blob) => {
      data.set(file, blob);
    },
    remove: async (file) => {
      data.delete(file);
    },
    subfolder: async (sub) => {
      let inner = folders.get(sub);
      if (!inner) {
        inner = memoryFolder(sub);
        folders.set(sub, inner);
      }
      return inner;
    },
  };
  return folder;
}

const HANDLE_DB = 'forge-toolbox-folder';
const HANDLES = 'handles';
const KEY = 'folder';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HANDLES);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function handleTx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openHandleDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(HANDLES, mode);
      const request = fn(tx.objectStore(HANDLES));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** the handle of the chosen folder, undefined when none is chosen */
export const loadFolderHandle = (): Promise<FolderHandle | undefined> =>
  handleTx<FolderHandle | undefined>('readonly', (store) => store.get(KEY));

export const saveFolderHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  await handleTx('readwrite', (store) => store.put(handle, KEY));
};

/** forgets the folder; its files stay */
export const clearFolderHandle = async (): Promise<void> => {
  await handleTx('readwrite', (store) => store.delete(KEY));
};
