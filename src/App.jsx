import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { HomeGate, ProtectedRoute } from '@/components/routing';
import AppShell from '@/components/AppShell';

import Landing from '@/pages/Landing';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import Onboarding from '@/pages/auth/Onboarding';
import Explore from '@/pages/Explore';
import Dashboard from '@/pages/Dashboard';
import ContestDetail from '@/pages/ContestDetail';
import Winners from '@/pages/Winners';
import Leaderboard from '@/pages/Leaderboard';
import Feed from '@/pages/Feed';
import CreatorProfile from '@/pages/CreatorProfile';
import Work from '@/pages/Work';
import Wallet from '@/pages/Wallet';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import Notifications from '@/pages/Notifications';
import Social from '@/pages/Social';
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
            <Route path="/winners" element={<Winners />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/u/:id" element={<CreatorProfile />} />
            <Route path="/contest/:id" element={<ContestDetail />} />
            <Route path="/help" element={<Help />} />
            {/* Authenticated */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/work" element={<ProtectedRoute><Work /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/social" element={<ProtectedRoute roles={['client']}><Social /></ProtectedRoute>} />
            <Route path="/create-contest" element={<ProtectedRoute roles={['client']}><CreateContest /></ProtectedRoute>} />
            <Route path="/contest/:id/submit" element={<ProtectedRoute roles={['creator']}><SubmitWork /></ProtectedRoute>} />
            <Route path="/contest/:id/review" element={<ProtectedRoute roles={['client']}><Review /></ProtectedRoute>} />
            <Route path="/contest/:id/handover" element={<ProtectedRoute><Handover /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Admin /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
