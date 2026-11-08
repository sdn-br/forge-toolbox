import type { Call } from '../../content/core/rpc';
import type { BuildingDefFileData } from './contract';

/** The cached metadata files as the service worker keeps them: raw JSON, no translation. */
export interface BuildingDefFiles {
  all(): Promise<BuildingDefFileData[]>;
  /** the file from the database, else downloaded; `json` is missing when it cannot be read */
  file(id: string, url: string): Promise<{ json?: unknown }>;
  missing(): Promise<string[]>;
  put(files: BuildingDefFileData[]): Promise<void>;
}

/** The service worker reads the files: a request from the content script would be held to the page's CORS. */
export function buildingDefFiles(call: Call): BuildingDefFiles {
  return {
    all: async () => (await call('buildingDefs.all', {})).files,
    file: (id, url) => call('buildingDefs.file', { id, url }),
    missing: async () => (await call('buildingDefs.missing', {})).ids,
    put: async (files) => {
      await call('buildingDefs.put', { files });
    },
  };
}
