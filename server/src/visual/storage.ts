// @ts-nocheck
// AssetStorageProvider — where generated campaign artwork actually lives.
//
// The previous implementation was a no-op ported from Base44: `store()` computed
// a plausible-looking storage_key and then returned the SOURCE URL unchanged,
// uploading nothing. R2 was never touched. So a VisualAsset row carried a
// storage_key pointing at an object that did not exist, alongside a storage_url
// that was either a provider URL due to expire or a multi-megabyte base64 data
// URI sitting in a database column.
//
// This version takes BYTES and uploads them. The contract change is the fix:
// a function handed a URL can quietly decide not to store anything, while a
// function handed bytes has to put them somewhere.
import { uploadPublic, storagePrefix } from '../integrations/storage.js';

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/**
 * Stable, collision-free object key.
 *
 * Every segment comes from a server-owned id, never from a provider string or
 * anything a user typed — a filename that can influence the key is a path
 * traversal waiting to happen. The version is in the key so regenerating makes
 * a NEW object rather than overwriting the artwork a campaign is currently
 * showing.
 */
export function storageKeyFor({ entityType, entityId, assetType, version }, mime) {
  const ext = EXT_BY_MIME[String(mime)] || 'png';
  return storagePrefix('visual-assets', entityType, entityId, assetType) + `/v${version}.${ext}`;
}

export function createStorageProvider() {
  return {
    /**
     * store(image, ctx) → { storage_url, storage_key, bytes, mime }
     *
     * `image` is { bytes, mime } from the generation provider. Anything else is
     * rejected loudly: silently accepting a URL here is precisely how this
     * layer became a no-op in the first place.
     */
    async store(image, ctx) {
      if (!image || !Buffer.isBuffer(image.bytes) || image.bytes.length === 0) {
        throw new Error('AssetStorage.store requires image bytes — a URL cannot be persisted.');
      }
      const key = storageKeyFor(ctx, image.mime);
      const { file_url } = await uploadPublic(image.bytes, key, image.mime);
      return {
        storage_url: file_url,
        storage_key: key,
        bytes: image.bytes.length,
        mime: image.mime,
      };
    },

    getUrl(asset) {
      return (asset && asset.storage_url) || null;
    },

    // Superseded versions are kept: their keys are versioned, so an old asset
    // stays retrievable for audit rather than being overwritten by the next
    // generation. Archiving is a metadata state, not a delete.
    async archive(asset) {
      return asset;
    },

    async remove() {
      return true;
    },
  };
}
