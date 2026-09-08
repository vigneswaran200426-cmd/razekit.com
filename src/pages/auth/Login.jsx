import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import AuthShell from './AuthShell';
import { Button, Input, Label } from '@/components/ui';
import { auth } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { GoogleButton } from './GoogleButton';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setNote(''); setLoading(true);
    try {
      await auth.login(email.trim(), password);
      await refresh();
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (e2) {
      setErr(e2.message || 'Invalid email or password');
    } finally { setLoading(false); }
  };

  const forgot = async () => {
    setErr('');
    if (!email.trim()) { setErr('Enter your email first, then tap “Forgot password?”'); return; }
    try { await auth.resetRequest(email.trim()); setNote('If that email has an account, a reset link is on its way.'); }
    catch { setNote('If that email has an account, a reset link is on its way.'); }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your RazeKit account"
      footer={<>New to RazeKit? <Link to="/register" className="text-primary font-semibold hover:underline">Create an account</Link></>}>
      <GoogleButton label="Continue with Google" />
      <div className="relative my-6 text-center"><span className="relative z-10 bg-bg px-3 text-xs uppercase tracking-wide text-muted">or</span><div className="absolute inset-x-0 top-1/2 h-px bg-line" /></div>

      {err && <div className="mb-4 rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}
      {note && <div className="mb-4 rounded-md bg-primary/8 text-primary text-sm px-3 py-2">{note}</div>}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="you@example.com" /></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="password" className="mb-0">Password</Label>
            <button type="button" onClick={forgot} className="text-xs text-primary hover:underline">Forgot password?</button>
          </div>
          <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" placeholder="••••••••" /></div>
        </div>
        <Button type="submit" size="lg" loading={loading} className="w-full">Log in</Button>
      </form>
    </AuthShell>
  );
}
