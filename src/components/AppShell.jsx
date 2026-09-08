import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, HelpCircle, Menu, X, LayoutDashboard, Compass, Trophy, LineChart,
  User, Settings, Wallet, FolderKanban, LogOut, Shield, ChevronDown, Video, Briefcase, Check,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { entities } from '@/lib/api';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { RazekitMark, RazekitWordmark } from '@/components/Brand';

const NAV = {
  creator: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/winners', label: 'Winners', icon: Trophy },
  ],
  client: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/winners', label: 'Winners', icon: Trophy },
    { to: '/social', label: 'Social Tracker', icon: LineChart },
  ],
  admin: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/winners', label: 'Winners', icon: Trophy },
  ],
  visitor: [
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/winners', label: 'Winners', icon: Trophy },
  ],
};

const QUICK = {
  creator: [{ to: '/work', label: 'My Work', icon: FolderKanban }, { to: '/wallet', label: 'Earnings', icon: Wallet }],
  client: [{ to: '/work', label: 'My Contests', icon: FolderKanban }, { to: '/wallet', label: 'Wallet', icon: Wallet }],
};

function useClickOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

const MODES = [
  { key: 'visitor', label: 'Admin', icon: Shield },
  { key: 'creator', label: 'Creator', icon: Video },
  { key: 'client', label: 'Brand', icon: Briefcase },
];

function AccountMenu() {
  const { user, role, isAdmin, signOut, switchMode } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const quick = QUICK[role] || [];
  const go = (to) => { setOpen(false); navigate(to); };
  const doSwitch = async (mode) => {
    if (mode === role || (mode === 'visitor' && role === 'admin')) return;
    setSwitching(true);
    try { await switchMode(mode); setOpen(false); navigate('/dashboard'); } finally { setSwitching(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Account menu" aria-expanded={open}
        className="ml-1 flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white text-[12px] font-bold">{initials(user?.full_name || user?.email)}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 mt-2 w-60 rounded-lg border border-line bg-surface shadow-lg p-1.5 z-50">
            <div className="px-2.5 py-2">
              <p className="text-sm font-semibold text-ink truncate">{user?.full_name || 'Your account'}</p>
              <p className="text-xs text-muted truncate">{user?.email}</p>
            </div>
            {isAdmin && (
              <div className="px-2 pb-2">
                <p className="px-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">View as</p>
                <div className="grid grid-cols-3 gap-1">
                  {MODES.map((m) => {
                    const activeMode = (m.key === 'visitor' && role === 'admin') || m.key === role;
                    return (
                      <button key={m.key} onClick={() => doSwitch(m.key)} disabled={switching}
                        className={cn('flex flex-col items-center gap-1 rounded-md border py-2 text-[11px] font-semibold transition-colors',
                          activeMode ? 'border-primary bg-primary/5 text-primary' : 'border-line text-muted hover:border-line-strong hover:text-ink')}>
                        <m.icon className="w-4 h-4" />{m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="h-px bg-line my-1" />
            {quick.map((q) => <MenuItem key={q.to} icon={q.icon} onClick={() => go(q.to)}>{q.label}</MenuItem>)}
            {quick.length > 0 && <div className="h-px bg-line my-1" />}
            <MenuItem icon={User} onClick={() => go('/profile')}>Profile</MenuItem>
            <MenuItem icon={Settings} onClick={() => go('/settings')}>Settings</MenuItem>
            {isAdmin && <MenuItem icon={Shield} onClick={() => go('/admin')}>Admin</MenuItem>}
            <div className="h-px bg-line my-1" />
            <MenuItem icon={LogOut} danger onClick={() => { setOpen(false); signOut().then(() => navigate('/')); }}>Sign out</MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon: Icon, children, danger, ...props }) {
  return (
    <button {...props} className={cn('w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-left transition-colors',
      danger ? 'text-danger hover:bg-danger/8' : 'text-ink hover:bg-surface-2')}>
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

function IconBtn({ to, onClick, label, children, badge }) {
  const cls = 'relative grid place-items-center w-10 h-10 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors';
  const inner = <>{children}{badge}</>;
  return to ? <Link to={to} aria-label={label} className={cls}>{inner}</Link> : <button onClick={onClick} aria-label={label} className={cls}>{inner}</button>;
}

export default function AppShell() {
  const { user, role, status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isVisitor = status !== 'authenticated';
  const navItems = NAV[isVisitor ? 'visitor' : role] || NAV.visitor;

  useEffect(() => {
    if (!user?.id) { setUnread(0); return; }
    entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', 50)
      .then((l) => setUnread((l || []).filter((n) => !n.read).length)).catch(() => {});
  }, [user?.id]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); navigate('/explore'); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const active = (to) => location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="shell h-16 flex items-center gap-3">
          <Link to="/" aria-label="RazeKit home" className="flex items-center gap-2.5 shrink-0">
            <RazekitMark size={34} /><span className="hidden sm:block"><RazekitWordmark size={22} /></span>
          </Link>
          <span className="hidden md:block h-7 w-px bg-line mx-3" aria-hidden="true" />

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {navItems.map((it) => (
              <NavLink key={it.to} to={it.to}
                className={() => cn('relative px-3 py-2 text-sm font-medium rounded-md transition-colors', active(it.to) ? 'text-ink' : 'text-muted hover:text-ink hover:bg-surface-2')}>
                {it.label}
                {active(it.to) && <motion.span layoutId="nav-underline" className="absolute left-2.5 right-2.5 -bottom-[9px] h-0.5 rounded-full bg-primary" transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} />}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => navigate('/explore')} aria-label="Search"
              className="hidden sm:flex items-center gap-2 h-9 pl-3 pr-2 rounded-md border border-line-strong bg-surface-2/60 text-muted hover:text-ink hover:border-primary/40 transition-colors">
              <Search className="w-4 h-4" /><span className="text-[13px]">Search</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-line text-muted">⌘K</kbd>
            </button>
            <IconBtn onClick={() => navigate('/explore')} label="Search"><Search className="w-5 h-5 sm:hidden" /></IconBtn>
            {!isVisitor && (
              <IconBtn to="/notifications" label="Notifications" badge={unread > 0 && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary ring-2 ring-surface" />}>
                <Bell className="w-5 h-5" />
              </IconBtn>
            )}
            <IconBtn to="/help" label="Help"><HelpCircle className="w-5 h-5 hidden sm:block" /></IconBtn>

            {isVisitor ? (
              <div className="hidden md:flex items-center gap-2 ml-1">
                <Link to="/login" className="px-3.5 py-2 text-sm font-medium text-ink rounded-md hover:bg-surface-2">Sign in</Link>
                <Link to="/register" className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-md shadow-glow hover:bg-primary-ink transition-colors">Create account</Link>
              </div>
            ) : <AccountMenu />}

            <button onClick={() => setMobileOpen((v) => !v)} aria-label="Menu" aria-expanded={mobileOpen}
              className="md:hidden grid place-items-center w-10 h-10 rounded-md text-ink hover:bg-surface-2">
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
              className="md:hidden border-t border-line bg-surface overflow-hidden">
              <nav className="shell py-3 flex flex-col gap-1">
                {navItems.map((it) => (
                  <Link key={it.to} to={it.to} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium', active(it.to) ? 'bg-primary/10 text-primary' : 'text-ink hover:bg-surface-2')}>
                    <it.icon className="w-[18px] h-[18px]" />{it.label}
                  </Link>
                ))}
                <div className="h-px bg-line my-1.5" />
                {isVisitor ? (
                  <div className="flex gap-2">
                    <Link to="/login" className="flex-1 text-center px-4 py-2.5 rounded-md border border-line-strong text-sm font-medium">Sign in</Link>
                    <Link to="/register" className="flex-1 text-center px-4 py-2.5 rounded-md bg-primary text-white text-sm font-semibold">Create account</Link>
                  </div>
                ) : (
                  <>
                    <Link to="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-ink hover:bg-surface-2"><User className="w-[18px] h-[18px]" />Profile</Link>
                    <Link to="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-ink hover:bg-surface-2"><Settings className="w-[18px] h-[18px]" />Settings</Link>
                  </>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">
        <div className="shell py-6 sm:py-8">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
