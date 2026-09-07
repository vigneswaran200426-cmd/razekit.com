import { Image } from '@/components/ui/image';
import useVisualAsset from '@/hooks/useVisualAsset';
import { cn } from '@/lib/utils';

// VisualAssetImage — the one UI contract of the Visual Asset System.
// Cards and pages receive an entity + asset type and render whatever artwork
// is current. No generation, prompt, storage or retry logic lives here; the
// neutral gradient placeholder is an emergency fallback only (asset missing,
// generating, or generation failed).
export default function VisualAssetImage({
  entityType,
  entityId,
  assetType,
  ensure = false,
  fallbackAssetType = null,
  className,
  placeholderClassName,
  alt = '',
}) {
  const primary = useVisualAsset(entityType, entityId, assetType, { ensure });
  const fallback = useVisualAsset(
    fallbackAssetType ? entityType : null,
    fallbackAssetType ? entityId : null,
    fallbackAssetType || assetType
  );

  const url = primary.url || fallback.url;
  const busy = primary.loading || fallback.loading;

  if (url) {
    return (
      <Image
        src={url}
        alt={alt}
        fittingType="fill"
        className={cn('absolute inset-0 w-full h-full', className)}
      />
    );
  }

  // Emergency fallback only — never the permanent visual.
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn(
        'absolute inset-0 w-full h-full bg-gradient-to-br from-[#1A7BF8] via-[#4DA6FF] to-[#77D8FF]',
        busy && 'shimmer',
        placeholderClassName
      )}
    />
  );
}