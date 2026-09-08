import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User } from 'lucide-react';
import AuthShell from './AuthShell';
import { Button, Input, Label } from '@/components/ui';
import { auth } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { GoogleButton } from './GoogleButton';

export default function Register() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const start = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const r = await auth.register({ email: email.trim(), password, full_name: fullName.trim() });
      if (r?.access_token) { await refresh(); navigate('/onboarding', { replace: true }); return; }
      setStep('otp');
    }
    catch (e2) { setErr(e2.message || 'Could not create your account.'); }
    finally { setLoading(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const r = await auth.verifyOtp(email.trim(), code.trim());
      if (!r?.access_token) throw new Error('Verification failed.');
      await refresh();
      navigate('/onboarding', { replace: true });
    } catch (e2) { setErr(e2.message || 'Incorrect code.'); }
    finally { setLoading(false); }
  };

  if (step === 'otp') {
    return (
      <AuthShell title="Verify your email" subtitle={`We sent a 6-digit code to ${email}.`}
        footer={<button onClick={() => auth.resendOtp(email.trim())} className="text-primary font-semibold hover:underline">Resend code</button>}>
        {err && <div className="mb-4 rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}
        <form onSubmit={verify} className="space-y-4">
          <div>
            <Label htmlFor="code">Verification code</Label>
            <Input id="code" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-lg tracking-[0.5em] font-semibold nums" placeholder="000000" />
          </div>
          <Button type="submit" size="lg" loading={loading} className="w-full">Verify & continue</Button>
          <button type="button" onClick={() => setStep('form')} className="w-full text-sm text-muted hover:text-ink">← Back</button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Join RazeKit" subtitle="Create your account to compete or launch contests"
      footer={<>Already have an account? <Link to="/login" className="text-primary font-semibold hover:underline">Log in</Link></>}>
      <GoogleButton label="Sign up with Google" />
      <div className="relative my-6 text-center"><span className="relative z-10 bg-bg px-3 text-xs uppercase tracking-wide text-muted">or</span><div className="absolute inset-x-0 top-1/2 h-px bg-line" /></div>
      {err && <div className="mb-4 rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}
      <form onSubmit={start} className="space-y-4">
        <div><Label htmlFor="name">Full name</Label>
          <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-9" placeholder="Your name" /></div></div>
        <div><Label htmlFor="email">Email</Label>
          <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="you@example.com" /></div></div>
        <div><Label htmlFor="password">Password</Label>
          <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" placeholder="At least 8 characters" /></div></div>
        <Button type="submit" size="lg" loading={loading} className="w-full">Create account</Button>
      </form>
    </AuthShell>
  );
}
