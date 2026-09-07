import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import OAuthConsent from '@/pages/OAuthConsent';
import HomeGate from '@/components/HomeGate';
import AuthGate from '@/components/AuthGate';
import CreateContest from '@/pages/CreateContest';
import Explore from '@/pages/Explore';
import ContestDetail from '@/pages/ContestDetail';
import MyContests from '@/pages/MyContests';
import Funds from '@/pages/Funds';
import ContestPublished from '@/pages/ContestPublished';
import Profile from '@/pages/Profile';
import EditProfile from '@/pages/EditProfile';
import SocialAccounts from '@/pages/SocialAccounts';
import WinnersHub from '@/pages/WinnersHub';
import AdminFootageSecurity from '@/pages/AdminFootageSecurity';
import Wallet from '@/pages/Wallet';
import AdminPayments from '@/pages/AdminPayments';
import Help from '@/pages/Help';
import Onboarding from '@/pages/Onboarding';
import AdminUsers from '@/pages/AdminUsers';
import AdminSupport from '@/pages/AdminSupport';
import AdminEnforcement from '@/pages/AdminEnforcement';
import AdminTrust from '@/pages/AdminTrust';
import AdminVisualAssets from '@/pages/AdminVisualAssets';
import AccountStanding from '@/pages/AccountStanding';
import Working from '@/pages/Working';
import SubmitWork from '@/pages/SubmitWork';
import Review from '@/pages/Review';
import Winner from '@/pages/Winner';
import Results from '@/pages/Results';
import HandoverHome from '@/pages/handover/HandoverHome';
import HandoverGuide from '@/pages/handover/HandoverGuide';
import HandoverRoom from '@/pages/handover/HandoverRoom';
import HandoverWinnerConfirm from '@/pages/handover/HandoverWinnerConfirm';
import HandoverClientConfirm from '@/pages/handover/HandoverClientConfirm';
import ContestCompleted from '@/pages/ContestCompleted';
import Notifications from '@/pages/Notifications';
import Settings from '@/pages/Settings';
import AccountSettings from '@/pages/settings/AccountSettings';
import NotificationSettings from '@/pages/settings/NotificationSettings';
import PrivacySecurity from '@/pages/settings/PrivacySecurity';
import PaymentSettings from '@/pages/settings/PaymentSettings';
import LegalSettings from '@/pages/settings/LegalSettings';
import DeleteAccount from '@/pages/settings/DeleteAccount';
import PostDetail from '@/pages/PostDetail';
import Search from '@/pages/Search';
import PublicProfile from '@/pages/PublicProfile';
import Layout from '@/components/Layout';
import RoleRoute from '@/components/RoleRoute';
import AdminRoute from '@/components/AdminRoute';
import AfterLoginRedirect from '@/components/AfterLoginRedirect';
import CreatorDashboard from '@/pages/creator/CreatorDashboard';
import ClientDashboard from '@/pages/client/ClientDashboard';
import SocialTracker from '@/pages/SocialTracker';
import LanguageSettings from '@/pages/settings/LanguageSettings';
import { I18nProvider } from '@/lib/i18n/I18nContext';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  // Route architecture:
  //   "/"            → HomeGate (state machine: landing for visitors, role dashboard for accounts)
  //   Public group   → visitor-browsable discovery surfaces (Layout chrome, no identity)
  //   AuthGate group → session-confirmed only; RoleRoute/AdminRoute separate Brand / Creator / Admin
  return (
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