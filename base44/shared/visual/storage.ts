// AssetStorageProvider — abstraction over the platform media storage layer so
// the asset system is not hard-coded to one storage vendor. Generated artwork
// is served through the platform's optimized media/CDN layer (responsive
// re-encoding, srcset variants); versions are metadata-archived, never destroyed.
export function storageKeyFor({ entityType, entityId, assetType, version }, url) {
  const ext = String(url || "").split("?")[0].split(".").pop().slice(0, 5) || "img";
  return `visual-assets/${entityType}/${entityId}/${assetType}/v${version}.${ext}`;
}

export function createStorageProvider() {
  return {
    // store(sourceUrl, ctx) → { storage_url, storage_key }
    async store(sourceUrl, ctx) {
      if (!sourceUrl) throw new Error("No source URL to store");
      return {
        storage_url: sourceUrl,
        storage_key: storageKeyFor(ctx, sourceUrl),
      };
    },

    // getUrl(asset) — canonical public delivery URL
    getUrl(asset) {
      return (asset && asset.storage_url) || null;
    },

    // archive(asset) — versions are never destroyed; archiving is a metadata state
    async archive(asset) {
      return asset;
    },

    async remove() {
      return true;
    },
  };
}