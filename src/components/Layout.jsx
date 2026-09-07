import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Compass, Trophy, User as UserIcon, LogOut, LogIn, UserPlus, Bell,
  Wallet as WalletIcon, Settings as SettingsIcon, Users as UsersIcon,
  Home as HomeIcon, Shield, HelpCircle, Image as ImageIcon, Share2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isAppAdmin } from '@/lib/role-utils';
import HelpButton from '@/components/help/HelpButton';
import { RazekitIcon } from '@/components/brand/RazekitLogo';
import { cn } from '@/lib/utils';

// Authenticated navigation — role-aware so Brand and Creator surfaces stay separate.
const primaryNavByRole = {
  brand: [
    { path: '/client/dashboard', label: 'Home', icon: HomeIcon },
    { path: '/explore', label: 'Explore', icon: Compass },
    { path: '/social', label: 'Social', icon: Share2 },
    { path: '/winners-hub', label: 'Winners', icon: Trophy },
    { path: '/wallet', label: 'Wallet', icon: WalletIcon },
    { path: '/profile', label: 'Profile', icon: UserIcon },
  ],
  creator: [
    { path: '/creator/dashboard', label: 'Home', icon: HomeIcon },
    { path: '/explore', label: 'Explore', icon: Compass },
    { path: '/winners-hub', label: 'Winners', icon: Trophy },
    { path: '/wallet', label: 'Earnings', icon: WalletIcon },
    { path: '/profile', label: 'Profile', icon: UserIcon },
  ],
};

// A visitor is a session state, NOT an identity: public browse links only —
// never a fake profile, name, or avatar.
const visitorNav = [
  { path: '/explore', label: 'Explore', icon: Compass },
  { path: '/winners-hub', label: 'Winners', icon: Trophy },
  { path: '/help', label: 'Help', icon: HelpCircle },
];

const railExtra = [
  { path: '/admin/users', label: 'Users', icon: UsersIcon, adminOnly: true },
  { path: '/admin/trust', label: 'Trust & Safety', icon: Shield, adminOnly: true },
  { path: '/admin/visual-assets', label: 'Visual Assets', icon: ImageIcon, adminOnly: true },
];

// One rail item: icon by default, label appears as a tooltip on hover (desktop).
function RailLink({ item, active, badge }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      aria-label={item.label}
      className="group/rail relative flex items-center justify-center"
    >
      <span
        className={cn(
          'relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200 ease-brand active:scale-[0.94]',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
        )}
      >
        <Icon className="w-[19px] h-[19px]" />
        {active && <span className="absolute left-[-14px] w-[3px] h-5 rounded-r-full bg-primary" aria-hidden="true" />}
        {badge}
      </span>
      <span className="pointer-events-none absolute left-[58px] top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 -translate-x-1 shadow-elev-2 transition-all duration-150 ease-brand group-hover/rail:opacity-100 group-hover/rail:translate-x-0">
        {item.label}
      </span>
    </Link>
  );
}

function RailButton({ label, icon: Icon, onClick, tone = 'default' }) {
  return (
    <button onClick={onClick} aria-label={label} className="group/rail relative flex items-center justify-center">
      <span className={cn(
        'flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200 ease-brand active:scale-[0.94]',
        tone === 'danger' ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive' : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
      )}>
        <Icon className="w-[19px] h-[19px]" />
      </span>
      <span className="pointer-events-none absolute left-[58px] top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 -translate-x-1 shadow-elev-2 transition-all duration-150 ease-brand group-hover/rail:opacity-100 group-hover/rail:translate-x-0">
        {label}
      </span>
    </button>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, authState, isLoading, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  // Unread notification badge — authenticated users only.
  useEffect(() => {
    if (!user?.id) { setUnread(0); return; }
    base44.entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', 50)
      .then((list) => setUnread(list.filter((n) => !n.read).length))
      .catch(() => {});
  }, [user?.id]);

  // Authenticated accounts that never finished role selection complete onboarding first.
  useEffect(() => {
    if (user && !user.onboarding_completed && location.pathname !== '/onboarding') {
      navigate('/onboarding');
    }
  }, [user, location.pathname, navigate]);

  const isActive = (path) => location.pathname === path;

  // AUTH_LOADING: neutral skeleton — never render a visitor shell or a wrong-role shell.
  if (isLoading || authState === 'loading') {
    return (
      <div className="min-h-screen bg-background flex flex-col md:flex-row">
        <aside className="hidden md:flex w-[72px] flex-col items-center fixed inset-y-0 left-0 border-r border-border/40 bg-white/80 backdrop-blur-xl z-30 py-4">
          <div className="w-9 h-9 rounded-xl bg-secondary animate-pulse mb-4" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="w-11 h-11 rounded-xl bg-secondary/70 animate-pulse" />)}
          </div>
        </aside>
        <main className="flex-1 md:ml-[72px] p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="h-7 w-52 rounded-lg bg-secondary animate-pulse" />
            <div className="h-28 rounded-2xl bg-secondary/60 animate-pulse" />
            <div className="h-40 rounded-2xl bg-secondary/50 animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  const isVisitor = authState === 'visitor';
  const navItems = isVisitor ? visitorNav : (primaryNavByRole[role] || visitorNav);
  const secondary = !isVisitor
    ? [
        ...railExtra.filter((it) => !it.adminOnly || isAppAdmin(user)),
        { path: '/notifications', label: 'Notifications', icon: Bell },
        { path: '/settings', label: 'Settings', icon: SettingsIcon },
        { path: '/help', label: 'Help', icon: HelpCircle },
      ]
    : [];

  // Mobile keeps the bottom bar to 5 items — brand drops Winners (still one tap away).
  const mobileNav = isVisitor
    ? [...visitorNav, { path: '/login', label: 'Sign in', icon: LogIn }]
    : role === 'brand'
      ? navItems.filter((it) => it.path !== '/winners-hub')
      : navItems;

  // Real identity from the server session — no fallback fake name.
  const initials = (user?.full_name || user?.email || '?')
    .trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const notifDot = unread > 0 ? (
    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-white" aria-hidden="true" />
  ) : null;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Desktop / tablet: compact icon rail ── */}
      <aside className="hidden md:flex w-[72px] flex-col items-center fixed inset-y-0 left-0 z-30 border-r border-border/50 bg-white/75 backdrop-blur-xl py-4">
        <Link to="/" aria-label="RazeKit" className="mb-4 shrink-0">
          <RazekitIcon size={32} />
        </Link>

        <nav className="flex flex-col items-center gap-1">
          {navItems.map((item) => (
            <RailLink key={item.path} item={item} active={isActive(item.path)} />
          ))}
        </nav>

        {secondary.length > 0 && (
          <>
            <span className="w-8 h-px bg-border/70 my-3" aria-hidden="true" />
            <nav className="flex flex-col items-center gap-1">
              {secondary.map((item) => (
                <RailLink key={item.path} item={item} active={isActive(item.path)} badge={item.path === '/notifications' ? notifDot : null} />
              ))}
            </nav>
          </>
        )}

        {/* Rail footer: identity or visitor sign-in */}
        <div className="mt-auto flex flex-col items-center gap-1 pt-3">
          {isVisitor ? (
            <>
              <RailLink item={{ path: '/login', label: 'Sign in', icon: LogIn }} active={false} />
              <RailLink item={{ path: '/register', label: 'Join Razekit', icon: UserPlus }} active={false} />
            </>
          ) : (
            <>
              <Link
                to="/profile"
                aria-label="Profile"
                className={cn(
                  'w-9 h-9 rounded-full bg-razekit-gradient text-white text-[11px] font-bold flex items-center justify-center transition-all duration-200 ease-brand hover:scale-105 active:scale-95',
                  isActive('/profile') && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-white'
                )}
              >
                {initials}
              </Link>
              <RailButton label="Log out" icon={LogOut} onClick={() => logout()} tone="danger" />
            </>
          )}
        </div>
      </aside>

      {/* ── Page content ── */}
      <main className="md:ml-[72px] pb-[74px] md:pb-0 min-h-screen">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>

      {/* ── Mobile: premium bottom navigation ── */}
      <nav className="fixed bottom-0 inset-x-0 md:hidden z-50 border-t border-border/50 bg-white/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around items-stretch h-[58px]">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-label={item.label}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 flex-1 transition-colors duration-200',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {active && <span className="absolute top-0 w-7 h-[3px] rounded-b-full bg-primary" aria-hidden="true" />}
                <Icon className="w-[21px] h-[21px]" />
                <span className="text-[9.5px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Global Help ── */}
      <HelpButton />
    </div>
  );
}