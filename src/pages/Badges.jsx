import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import BadgeScreen from '@/components/xp/BadgeScreen';

export default function Badges() {
  const [user, setUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => setUser(null)); }, []);
  if (!user) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  return <BadgeScreen userId={user.id} />;
}