import { Suspense, lazy } from 'react';
import ConnectionStatus from '@/components/ConnectionStatus';
import CookieNotice from '@/components/CookieNotice';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RouteSeo } from '@/components/Seo';
import { AuthProvider } from '@/lib/auth';
import { HomeGate, ProtectedRoute } from '@/components/routing';
import AppShell from '@/components/AppShell';
import { NotificationProvider } from '@/components/Notifications';

// ── Route-level code splitting ──────────────────────────────────────────────
// The whole app used to ship as ONE 910KB chunk, so a visitor reading the
// homepage downloaded Admin, Tracker, Finance and the chart library before
// anything rendered. Each route below is now its own chunk, fetched when the
// route is actually visited.
//
// Landing, Login and Register stay eager on purpose: they are the first paint
// for a signed-out visitor, and lazy-loading them would add a round trip to
// exactly the moment that matters most.
import Landing from '@/pages/Landing';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';

const Admin = lazy(() => import('@/pages/Admin'));
const Balance = lazy(() => import('@/pages/Balance'));
const CampaignReport = lazy(() => import('@/pages/CampaignReport'));
const ContestDetail = lazy(() => import('@/pages/ContestDetail'));
const CreateContest = lazy(() => import('@/pages/CreateContest'));
const CreatorProfile = lazy(() => import('@/pages/CreatorProfile'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Development = lazy(() => import('@/pages/development/Development'));
const BuildDetail = lazy(() => import('@/pages/development/BuildDetail'));
const Discover = lazy(() => import('@/pages/Discover'));
const Explore = lazy(() => import('@/pages/Explore'));
const Feed = lazy(() => import('@/pages/Feed'));
const FundContest = lazy(() => import('@/pages/FundContest'));
const Handover = lazy(() => import('@/pages/Handover'));
const Help = lazy(() => import('@/pages/Help'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Onboarding = lazy(() => import('@/pages/auth/Onboarding'));
const Profile = lazy(() => import('@/pages/Profile'));
const Review = lazy(() => import('@/pages/Review'));
const Settings = lazy(() => import('@/pages/Settings'));
const SubmitWork = lazy(() => import('@/pages/SubmitWork'));
const TrackRecord = lazy(() => import('@/pages/TrackRecord'));
const Tracker = lazy(() => import('@/pages/Tracker'));
const WinnerVerify = lazy(() => import('@/pages/WinnerVerify'));
const Winners = lazy(() => import('@/pages/Winners'));
const Work = lazy(() => import('@/pages/Work'));
const Terms = lazy(() => import('@/pages/Legal').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('@/pages/Legal').then((m) => ({ default: m.Privacy })));
const About = lazy(() => import('@/pages/Legal').then((m) => ({ default: m.About })));
const Contact = lazy(() => import('@/pages/Legal').then((m) => ({ default: m.Contact })));
const Cookies = lazy(() => import('@/pages/Cookies'));


/**
 * Shown while a route chunk is in flight.
 *
 * Deliberately NOT a spinner. A centred spinner tells the reader "something is
 * happening somewhere"; a block that occupies the shape the page is about to
 * take tells them the page is arriving, and keeps the layout from jumping when
 * it does. It is aria-busy so a screen reader announces the wait rather than
 * reading an empty document.
 */
function RouteFallback() {
  return (
    <div className="shell py-10" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-7 w-52 rounded-md bg-surface-2" />
      <div className="mt-3 h-4 w-80 max-w-full rounded-md bg-surface-2/70" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-4">
            <div className="h-32 w-full rounded-md bg-surface-2" />
            <div className="mt-3 h-4 w-3/4 rounded bg-surface-2" />
            <div className="mt-2 h-3 w-1/2 rounded bg-surface-2/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
        {/* Per-route title, description, canonical and robots. */}
          <RouteSeo />
          {/* Renders null while the connection is healthy. Eagerly imported on
              purpose: a chunk that must be FETCHED to report a lost connection
              is the one chunk that cannot arrive when it is needed. */}
          <ConnectionStatus />
          {/* Eagerly imported, like ConnectionStatus: a notice about storage
              that itself needs a lazy chunk to arrive is a notice that shows up
              after the storage decision already mattered. It renders null once
              a choice exists, which is the common case. */}
          <CookieNotice />
          <Suspense fallback={<RouteFallback />}>
          <Routes>

          {/* Standalone */}
          <Route path="/" element={<HomeGate landing={Landing} />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

          {/* App shell (top nav) */}
          <Route element={<AppShell />}>
            {/* Public-in-shell */}
            <Route path="/explore" element={<Explore />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/winners" element={<Winners />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/u/:id" element={<CreatorProfile />} />
            <Route path="/contest/:id" element={<ContestDetail />} />
            <Route path="/help" element={<Help />} />
            {/* Public: anyone may read the terms they are agreeing to. */}
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            {/* Public and deliberately so: changing what is stored about you
                must not require signing in first. */}
            <Route path="/cookies" element={<Cookies />} />
            {/* Authenticated */}
            <Route path="/tracker" element={<ProtectedRoute><Tracker /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            {/* The Development product area. A sibling of the contest, brand and
                creator areas inside the same application — same shell, same
                account, same session. It adds a section; it replaces nothing. */}
            <Route path="/development" element={<ProtectedRoute><Development /></ProtectedRoute>} />
            <Route path="/development/:id" element={<ProtectedRoute><BuildDetail /></ProtectedRoute>} />
            <Route path="/work" element={<ProtectedRoute><Work /></ProtectedRoute>} />
            {/* The RazeKit balance. /wallet is kept as an alias so existing links
                and bookmarks keep working, but the product no longer uses the
                word "wallet" anywhere a user can see. */}
            <Route path="/balance" element={<ProtectedRoute><Balance /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><Balance /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/create-contest" element={<ProtectedRoute roles={['client']}><CreateContest /></ProtectedRoute>} />
            <Route path="/contest/:id/submit" element={<ProtectedRoute roles={['creator']}><SubmitWork /></ProtectedRoute>} />
            <Route path="/contest/:id/review" element={<ProtectedRoute roles={['client']}><Review /></ProtectedRoute>} />
            <Route path="/contest/:id/fund" element={<ProtectedRoute roles={['client']}><FundContest /></ProtectedRoute>} />
            {/* Reachable only after winning — the handler re-checks that the
                caller IS the winner, so the route is not the security boundary. */}
            <Route path="/contest/:id/verify" element={<ProtectedRoute><WinnerVerify /></ProtectedRoute>} />
            {/* The brand's post-campaign report; the handler re-checks ownership. */}
            <Route path="/contest/:id/report" element={<ProtectedRoute roles={['client']}><CampaignReport /></ProtectedRoute>} />
            {/* A creator's own competition history. */}
            <Route path="/track-record" element={<ProtectedRoute><TrackRecord /></ProtectedRoute>} />
            <Route path="/contest/:id/handover" element={<ProtectedRoute><Handover /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Admin /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
          </Suspense>
      </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
