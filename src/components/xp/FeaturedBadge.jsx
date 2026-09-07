import { BADGE_DEFINITIONS } from '@/lib/xpSystem';
import Emblem from './Emblem';

const SIZE_CLASS = { 32: 'w-8 h-8', 36: 'w-9 h-9', 40: 'w-10 h-10' };

// Renders a creator's chosen featured badge near their identity.
// featured_badge_id is only ever set by the owner from an earned badge.
export default function FeaturedBadge({ badgeId, size = 36 }) {
  if (!badgeId) return null;
  const def = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
  if (!def) return null;
  return <Emblem badge={def} earned className={SIZE_CLASS[size] || 'w-9 h-9'} />;
}