import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Compass, Trophy, Wallet as WalletIcon, Bell, HelpCircle, Search, Menu, X,
  User as UserIcon, Settings as SettingsIcon, Globe, LogOut, LogIn, UserPlus,
  Shield, Users as UsersIcon, Image as ImageIcon, CreditCard, LayoutDashboard,
  FolderKanban, Share2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isAppAdmin } from '@/lib/role-utils';
import HelpButton from '@/components/help/HelpButton';
import { RazekitIcon, RazekitWordmark } from '@/components/brand/RazekitLogo';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ── Role-aware PRIMARY navigation — top bar only, real routes only ───────────
const NAV = {
  creator: [
    { to: '/creator/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/my-contests', label: 'My Work', icon: FolderKanban },
    { to: '/winners-hub', label: 'Winners', icon: Trophy },
    { to: '/wallet', label: 'Earnings', icon: WalletIcon },
  ],
  brand: [
    { to: '/client/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/my-contests', label: 'Contests', icon: FolderKanban },
    { to: '/winners-hub', label: 'Winners', icon: Trophy },
    { to: '/social', label: 'Social', icon: Share2 },
    { to: '/wallet', label: 'Wallet', icon: WalletIcon },
  ],
  admin: [
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/winners-hub', label: 'Winners', icon: Trophy },
    { to: '/admin/trust', label: 'Trust', icon: Shield },
    { to: '/admin/payments', label: 'Payments', icon: CreditCard },
    { to: '/admin/users', label: 'Users', icon: UsersIcon },
  ],
  visitor: [
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/winners-hub', label: 'Winners', icon: Trophy },
    { to: '/help', label: 'Help', icon: HelpCircle },
  ],
};

const ADMIN_LINKS = [
  { to: '/admin/users', label: 'Users', icon: UsersIcon },
  { to: '/admin/trust', label: 'Trust & Safety', icon: Shield },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/visual-assets', label: 'Visual Assets', icon: ImageIcon },
];

function navClass(active) {
  return cn(
    'relative px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-150 ease-brand',
    active ? 'text-ink' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, authState, isLoading, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) { setUnread(0); return; }
    base44.entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', 50)
      .then((list) => setUnread(list.filter((n) => !n.read).length))
      .catch(() => {});
  }, [user?.id]);

  // Complete onboarding before entering the app.
  useEffect(() => {
    if (user && !user.onboarding_completed && location.pathname !== '/onboarding') navigate('/onboarding');
  }, [user, location.pathname, navigate]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // ⌘K / Ctrl+K → global search.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); navigate('/search'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // AUTH_LOADING → neutral header skeleton (never a wrong-role shell).
  if (isLoading || authState === 'loading') {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 h-16 border-b border-border/60 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto max-w-[1400px] h-full px-4 sm:px-6 flex items-center justify-between">
            <div className="w-28 h-7 rounded-md bg-secondary animate-pulse" />
            <div className="w-40 h-8 rounded-md bg-secondary/70 animate-pulse" />
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-8">
          <div className="h-8 w-56 rounded-lg bg-secondary animate-pulse mb-5" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-secondary/60 animate-pulse" />)}
          </div>
        </main>
      </div>
    );
  }

  const isVisitor = authState === 'visitor';
  const navKey = isVisitor ? 'visitor' : (role === 'admin' || (user?.role === 'admin' && !user?.user_role) ? 'admin' : (role || 'visitor'));
  const navItems = NAV[navKey] || NAV.visitor;
  const isActive = (to) => location.pathname === to || location.pathname.startsWith(to + '/');
  const initials = (user?.full_name || user?.email || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ─────────────────────────── TOP NAVIGATION ─────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] h-16 px-4 sm:px-6 flex items-center gap-3">

          {/* Brand */}
          <Link to="/" aria-label="RazeKit home" className="flex items-center gap-2.5 shrink-0 mr-2 press">
            <RazekitIcon size={30} />
            <span className="hidden sm:block"><RazekitWordmark height={20} /></span>
          </Link>

          {/* Primary nav (desktop) */}
          <nav className="hidden md:flex items-center gap-0.5" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={() => navClass(isActive(item.to))}>
                {item.label}
                {isActive(item.to) && (
                  <motion.span layoutId="topnav-active" className="absolute left-2 right-2 -bottom-[9px] h-0.5 rounded-full bg-primary" transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} />
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Search */}
            <button
              onClick={() => navigate('/search')}
              aria-label="Search"
              className="hidden sm:flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border border-border/70 bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors ease-brand"
            >
              <Search className="w-4 h-4" />
              <span className="text-[13px]">Search</span>
              <kbd className="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/70 border border-border/70 text-muted-foreground">⌘K</kbd>
            </button>
            <button onClick={() => navigate('/search')} aria-label="Search" className="sm:hidden grid place-items-center w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <Search className="w-5 h-5" />
            </button>

            {!isVisitor && (
              <Link to="/notifications" aria-label="Notifications" className="relative grid place-items-center w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
                <Bell className="w-5 h-5" />
                {unread > 0 && <span className="absolute top-2 right-2 min-w-[8px] h-2 w-2 rounded-full bg-primary ring-2 ring-white" aria-hidden="true" />}
              </Link>
            )}

            <Link to="/help" aria-label="Help" className="hidden sm:grid place-items-center w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <HelpCircle className="w-5 h-5" />
            </Link>

            {/* Account / auth */}
            {isVisitor ? (
              <div className="hidden md:flex items-center gap-2 ml-1">
                <Link to="/login" className="px-3.5 py-2 text-sm font-medium text-foreground rounded-lg hover:bg-secondary/60 transition-colors">Sign in</Link>
                <Link to="/register" className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg shadow-primary-glow hover:brightness-105 active:scale-95 transition-all ease-brand">Create account</Link>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label="Account menu" className="ml-1 grid place-items-center w-9 h-9 rounded-full bg-razekit-gradient text-white text-[11px] font-bold ring-1 ring-black/5 hover:scale-105 active:scale-95 transition-transform ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 rounded-xl">
                  <DropdownMenuLabel className="pb-1">
                    <p className="text-sm font-semibold text-ink truncate">{user?.full_name || 'Your account'}</p>
                    <p className="text-xs text-muted-foreground font-normal truncate">{user?.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/profile')}><UserIcon className="w-4 h-4 mr-2" /> Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/settings')}><SettingsIcon className="w-4 h-4 mr-2" /> Settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/settings/language')}><Globe className="w-4 h-4 mr-2" /> Language</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/notifications')}><Bell className="w-4 h-4 mr-2" /> Notifications</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/help')}><HelpCircle className="w-4 h-4 mr-2" /> Help</DropdownMenuItem>
                  {isAppAdmin(user) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Admin</DropdownMenuLabel>
                      {ADMIN_LINKS.map((a) => (
                        <DropdownMenuItem key={a.to} onClick={() => navigate(a.to)}><a.icon className="w-4 h-4 mr-2" /> {a.label}</DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive"><LogOut className="w-4 h-4 mr-2" /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              className="md:hidden grid place-items-center w-10 h-10 rounded-lg text-foreground hover:bg-secondary/60 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown panel (not a permanent sidebar) */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden border-t border-border/60 bg-white/95 backdrop-blur-xl"
          >
            <nav className="mx-auto max-w-[1400px] px-4 py-3 flex flex-col gap-1" aria-label="Mobile">
              {navItems.map((item) => (
                <Link key={item.to} to={item.to} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium', isActive(item.to) ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary/60')}>
                  <item.icon className="w-[18px] h-[18px]" /> {item.label}
                </Link>
              ))}
              <div className="h-px bg-border/60 my-2" />
              {isVisitor ? (
                <div className="flex gap-2">
                  <Link to="/login" className="flex-1 text-center px-4 py-2.5 rounded-lg border border-border/70 text-sm font-medium">Sign in</Link>
                  <Link to="/register" className="flex-1 text-center px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold">Create account</Link>
                </div>
              ) : (
                <>
                  <Link to="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-secondary/60"><UserIcon className="w-[18px] h-[18px]" /> Profile</Link>
                  <Link to="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-secondary/60"><SettingsIcon className="w-[18px] h-[18px]" /> Settings</Link>
                  <button onClick={() => logout()} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 text-left"><LogOut className="w-[18px] h-[18px]" /> Sign out</button>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </header>

      {/* ─────────────────────────── CONTENT CANVAS ─────────────────────────── */}
      <main className="flex-1">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>

      <HelpButton />
    </div>
  );
}
