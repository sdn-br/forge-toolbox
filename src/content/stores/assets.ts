import { type AssetIndex, assetUrl, isCdnUrl } from '../../shared/cdn-assets';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';

export interface AssetPersistence {
  /** the asset index of the game's script at this URL; undefined when it cannot be read */
  index(script: string): Promise<AssetIndex | undefined>;
}

/**
 * Game images on the Inno CDN for this session. The index comes from the game's script through the service worker,
 * maybe after the first boxes are drawn; `assets.loaded` tells them to draw again. Until then, and when the script
 * holds no index, every lookup finds nothing and the boxes show no images.
 */
export class AssetStore {
  private index?: AssetIndex;
  private origin?: string;
  private started = false;

  constructor(
    private bus: ToolboxBus,
    private persistence: AssetPersistence,
  ) {}

  /** reads the index of the game's script at `script`, once per session */
  async load(script: string): Promise<void> {
    if (this.started || !isCdnUrl(script)) return;
    this.started = true;
    try {
      const index = await this.persistence.index(script);
      if (!index) return;
      this.index = index;
      this.origin = new URL(script).origin;
      this.bus.emit('assets.loaded', {});
    } catch (error) {
      logError('reading the asset index of the game failed', error);
    }
  }

  /** the full URL of an asset path such as `/shared/.../name.jpg`; undefined while the index lacks it */
  url(path: string): string | undefined {
    const hash = this.index?.[path];
    return hash && this.origin ? assetUrl(this.origin, path, hash) : undefined;
  }
}
