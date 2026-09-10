import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { HomeGate, ProtectedRoute } from '@/components/routing';
import AppShell from '@/components/AppShell';
import { NotificationProvider } from '@/components/Notifications';

import Landing from '@/pages/Landing';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import Onboarding from '@/pages/auth/Onboarding';
import Explore from '@/pages/Explore';
import Discover from '@/pages/Discover';
import Tracker from '@/pages/Tracker';
import Dashboard from '@/pages/Dashboard';
import ContestDetail from '@/pages/ContestDetail';
import Winners from '@/pages/Winners';
import Feed from '@/pages/Feed';
import CreatorProfile from '@/pages/CreatorProfile';
import Work from '@/pages/Work';
import Balance from '@/pages/Balance';
import FundContest from '@/pages/FundContest';
import WinnerVerify from '@/pages/WinnerVerify';
import CampaignReport from '@/pages/CampaignReport';
import TrackRecord from '@/pages/TrackRecord';
import { Terms, Privacy, About, Contact } from '@/pages/Legal';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import Notifications from '@/pages/Notifications';
import Help from '@/pages/Help';
import Admin from '@/pages/Admin';
import CreateContest from '@/pages/CreateContest';
import SubmitWork from '@/pages/SubmitWork';
import Review from '@/pages/Review';
import Handover from '@/pages/Handover';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
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
            {/* Authenticated */}
            <Route path="/tracker" element={<ProtectedRoute><Tracker /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
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
      </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
