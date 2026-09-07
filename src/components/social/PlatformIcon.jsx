import { Instagram, Youtube, Twitter, Facebook, Linkedin, Music2, Pin, AtSign, Globe, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { platformById } from '@/lib/social-platforms';

// Registry-driven platform icon — one mapping, every future platform reuses it.
const ICONS = {
  instagram: Instagram,
  music: Music2,
  youtube: Youtube,
  facebook: Facebook,
  x: Twitter,
  linkedin: Linkedin,
  pinterest: Pin,
  threads: AtSign,
  other: Globe,
};

export default function PlatformIcon({ platform, className }) {
  const p = platformById(platform);
  const Icon = ICONS[p.icon] || LinkIcon;
  return <Icon className={cn('w-4 h-4', className)} style={{ color: p.color }} aria-hidden="true" />;
}