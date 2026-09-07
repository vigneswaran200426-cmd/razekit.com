import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';

// ── Eager: auth entry + structural chrome (needed for first paint) ──
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import OAuthConsent from '@/pages/OAuthConsent';
import HomeGate from '@/components/HomeGate';
import AuthGate from '@/components/AuthGate';
import Layout from '@/components/Layout';
import RoleRoute from '@/components/RoleRoute';
import AdminRoute from '@/components/AdminRoute';
import AfterLoginRedirect from '@/components/AfterLoginRedirect';
import { I18nProvider } from '@/lib/i18n/I18nContext';

// ── Lazy: every route page becomes its own chunk, loaded on demand ──
const CreateContest = lazy(() => import('@/pages/CreateContest'));
const Explore = lazy(() => import('@/pages/Explore'));
const ContestDetail = lazy(() => import('@/pages/ContestDetail'));
const MyContests = lazy(() => import('@/pages/MyContests'));
const Funds = lazy(() => import('@/pages/Funds'));
const ContestPublished = lazy(() => import('@/pages/ContestPublished'));
const Profile = lazy(() => import('@/pages/Profile'));
const EditProfile = lazy(() => import('@/pages/EditProfile'));
const SocialAccounts = lazy(() => import('@/pages/SocialAccounts'));
const WinnersHub = lazy(() => import('@/pages/WinnersHub'));
const AdminFootageSecurity = lazy(() => import('@/pages/AdminFootageSecurity'));
const Wallet = lazy(() => import('@/pages/Wallet'));
const AdminPayments = lazy(() => import('@/pages/AdminPayments'));
const Help = lazy(() => import('@/pages/Help'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const AdminUsers = lazy(() => import('@/pages/AdminUsers'));
const AdminSupport = lazy(() => import('@/pages/AdminSupport'));
const AdminEnforcement = lazy(() => import('@/pages/AdminEnforcement'));
const AdminTrust = lazy(() => import('@/pages/AdminTrust'));
const AdminVisualAssets = lazy(() => import('@/pages/AdminVisualAssets'));
const AccountStanding = lazy(() => import('@/pages/AccountStanding'));
const Working = lazy(() => import('@/pages/Working'));
const SubmitWork = lazy(() => import('@/pages/SubmitWork'));
const Review = lazy(() => import('@/pages/Review'));
const Winner = lazy(() => import('@/pages/Winner'));
const Results = lazy(() => import('@/pages/Results'));
const HandoverHome = lazy(() => import('@/pages/handover/HandoverHome'));
const HandoverGuide = lazy(() => import('@/pages/handover/HandoverGuide'));
const HandoverRoom = lazy(() => import('@/pages/handover/HandoverRoom'));
const HandoverWinnerConfirm = lazy(() => import('@/pages/handover/HandoverWinnerConfirm'));
const HandoverClientConfirm = lazy(() => import('@/pages/handover/HandoverClientConfirm'));
const ContestCompleted = lazy(() => import('@/pages/ContestCompleted'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Settings = lazy(() => import('@/pages/Settings'));
const AccountSettings = lazy(() => import('@/pages/settings/AccountSettings'));
const NotificationSettings = lazy(() => import('@/pages/settings/NotificationSettings'));
const PrivacySecurity = lazy(() => import('@/pages/settings/PrivacySecurity'));
const PaymentSettings = lazy(() => import('@/pages/settings/PaymentSettings'));
const LegalSettings = lazy(() => import('@/pages/settings/LegalSettings'));
const DeleteAccount = lazy(() => import('@/pages/settings/DeleteAccount'));
const PostDetail = lazy(() => import('@/pages/PostDetail'));
const Search = lazy(() => import('@/pages/Search'));
const PublicProfile = lazy(() => import('@/pages/PublicProfile'));
const CreatorDashboard = lazy(() => import('@/pages/creator/CreatorDashboard'));
const ClientDashboard = lazy(() => import('@/pages/client/ClientDashboard'));
const SocialTracker = lazy(() => import('@/pages/SocialTracker'));
const LanguageSettings = lazy(() => import('@/pages/settings/LanguageSettings'));

// Lightweight route-transition fallback (matches the app's loading spinner).
function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" aria-label="Loading" role="status" />
    </div>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  // Route architecture:
  //   "/"            → HomeGate (visitors: landing; accounts: role dashboard)
  //   Public group   → visitor-browsable discovery (Layout chrome, no identity)
  //   AuthGate group → session-confirmed only; RoleRoute/AdminRoute split Brand / Creator / Admin
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<HomeGate />} />
        <Route element={<AuthGate />}>
          <Route path="/onboarding" element={<Onboarding />} />
        </Route>
        <Route element={<Layout />}>
          {/* ── Public (visitor-browsable) ── */}
          <Route path="/explore" element={<Explore />} />
          <Route path="/contest/:id" element={<ContestDetail />} />
          <Route path="/winners-hub" element={<WinnersHub />} />
          <Route path="/u/:username" element={<PublicProfile />} />
          <Route path="/help" element={<Help />} />
          <Route path="/search" element={<Search />} />
          <Route path="/community/post/:id" element={<PostDetail />} />

          {/* ── Authenticated (server session required) ── */}
          <Route element={<AuthGate />}>
            <Route path="/after-login" element={<AfterLoginRedirect />} />
            <Route path="/creator/dashboard" element={<RoleRoute allowedRoles={['creator']}><CreatorDashboard /></RoleRoute>} />
            <Route path="/client/dashboard" element={<RoleRoute allowedRoles={['client']}><ClientDashboard /></RoleRoute>} />
            <Route path="/create-contest" element={<RoleRoute allowedRoles={['client']}><CreateContest /></RoleRoute>} />
            <Route path="/my-contests" element={<MyContests />} />
            <Route path="/funds" element={<Funds />} />
            <Route path="/contest-published/:id" element={<ContestPublished />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/edit-profile" element={<EditProfile />} />
            <Route path="/social-accounts" element={<SocialAccounts />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/social" element={<RoleRoute allowedRoles={['client']}><SocialTracker /></RoleRoute>} />
            <Route path="/admin/footage-security" element={<AdminRoute><AdminFootageSecurity /></AdminRoute>} />
            <Route path="/admin/payments" element={<AdminRoute><AdminPayments /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/support" element={<AdminRoute><AdminSupport /></AdminRoute>} />
            <Route path="/admin/enforcement" element={<AdminRoute><AdminEnforcement /></AdminRoute>} />
            <Route path="/admin/trust" element={<AdminRoute><AdminTrust /></AdminRoute>} />
            <Route path="/admin/visual-assets" element={<AdminRoute><AdminVisualAssets /></AdminRoute>} />
            <Route path="/account-standing" element={<AccountStanding />} />
            <Route path="/contest/:id/work" element={<RoleRoute allowedRoles={['creator']}><Working /></RoleRoute>} />
            <Route path="/contest/:id/submit" element={<RoleRoute allowedRoles={['creator']}><SubmitWork /></RoleRoute>} />
            <Route path="/contest/:id/review" element={<RoleRoute allowedRoles={['client']}><Review /></RoleRoute>} />
            <Route path="/contest/:id/winner" element={<Winner />} />
            <Route path="/contest/:id/results" element={<Results />} />
            <Route path="/contest/:id/handover" element={<HandoverHome />} />
            <Route path="/contest/:id/handover/guide" element={<HandoverGuide />} />
            <Route path="/contest/:id/handover/room" element={<HandoverRoom />} />
            <Route path="/contest/:id/handover/confirm" element={<HandoverWinnerConfirm />} />
            <Route path="/contest/:id/handover/complete" element={<HandoverClientConfirm />} />
            <Route path="/contest/:id/completed" element={<ContestCompleted />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/account" element={<AccountSettings />} />
            <Route path="/settings/notifications" element={<NotificationSettings />} />
            <Route path="/settings/privacy" element={<PrivacySecurity />} />
            <Route path="/settings/payments" element={<PaymentSettings />} />
            <Route path="/settings/legal" element={<LegalSettings />} />
            <Route path="/settings/language" element={<LanguageSettings />} />
            <Route path="/settings/delete-account" element={<DeleteAccount />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="/*" element={<I18nProvider><AuthenticatedApp /></I18nProvider>} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
