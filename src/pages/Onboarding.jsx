import { useState, useEffect } from 'react';
import { Loader2, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import RoleSelect from '@/components/onboarding/RoleSelect';
import StepProgress from '@/components/onboarding/StepProgress';
import OnboardingField from '@/components/onboarding/OnboardingField';
import { CLIENT_STEPS, CREATOR_STEPS } from '@/components/onboarding/stepsConfig';
import { validateOnboarding, createAccount, isValidPhone } from '@/lib/onboarding-utils';
import { getPostLoginPath } from '@/lib/post-login-route';

export default function Onboarding() {
  const [user, setUser] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | role | form | done
  const [role, setRole] = useState(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [doneRole, setDoneRole] = useState(null);

  useEffect(() => {
    base44.auth.me()
      .then((u) => {
        setUser(u);
        setData((d) => ({ ...d, full_name: u?.full_name || '' }));
        setPhase('role');
      })
      .catch(() => {});
  }, []);

  const steps = role === 'client' ? CLIENT_STEPS : CREATOR_STEPS;
  const allSteps = [...steps, { title: 'Confirm' }];
  const isConfirm = step === steps.length;

  const validateStep = () => {
    const errs = {};
    const s = steps[step];
    if (s) {
      for (const f of s.fields) {
        if (f.required && !(data[f.key] || '').toString().trim()) errs[f.key] = 'Required';
      }
      if (data.phone && !isValidPhone(data.phone)) errs.phone = 'Enter a valid phone';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep(step + 1);
  };
  const back = () => {
    if (step > 0) setStep(step - 1);
    else setRole(null);
  };

  const handleConfirm = async () => {
    const errs = validateOnboarding(role, data);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setStep(0);
      return;
    }
    setCreating(true);
    try {
      await createAccount({ user, role, data, source: 'web' });
      setDoneRole(role);
      setPhase('done');
    } catch (e) {
      setErrors({ _: e.message || 'Failed to create account. Try again.' });
    } finally {
      setCreating(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (phase === 'done') return <Done role={doneRole} />;
  if (!role) return <Center><RoleSelect onSelect={(r) => { setRole(r); setStep(0); }} /></Center>;

  if (isConfirm) {
    return (
      <ConfirmView
        role={role}
        data={data}
        steps={steps}
        step={step}
        onBack={back}
        onConfirm={handleConfirm}
        creating={creating}
        error={errors._}
      />
    );
  }

  const s = steps[step];
  return (
    <Center>
      <div className="max-w-md w-full glass-card rounded-3xl p-6 card-shadow-lg animate-fade-in">
        <StepProgress steps={allSteps} current={step} />
        <h2 className="font-heading text-xl font-bold mb-1">{s.title}</h2>
        <p className="text-sm text-muted-foreground mb-5">{s.subtitle}</p>
        <div className="space-y-4">
          {s.fields.map((f) => (
            <OnboardingField
              key={f.key}
              field={f}
              value={data[f.key]}
              onChange={(val) => setData((d) => ({ ...d, [f.key]: val }))}
              error={errors[f.key]}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 mt-6">
          <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={next}
            className="ml-auto flex items-center gap-1 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-[#0B48E8] hover:shadow-primary-glow hover:-translate-y-px active:scale-[0.98] transition-all duration-200"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Center>
  );
}

function Center({ children }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse 120% 60% at 50% -10%, hsl(200 100% 88% / 0.7) 0%, hsl(214 60% 97%) 70%)' }}
    >
      {children}
    </div>
  );
}

function Done({ role }) {
  const label = role === 'client' ? 'Brand' : 'Creator';
  return (
    <Center>
      <div className="max-w-md w-full text-center glass-card rounded-3xl p-8 card-shadow-lg animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-success/15 flex items-center justify-center mx-auto mb-5">
          <Check className="w-8 h-8 text-success" />
        </div>
        <h1 className="font-heading text-2xl font-bold mb-2">Your {label} account has been created.</h1>
        <p className="text-sm text-muted-foreground mb-6">
          We've sent a confirmation to your email. Welcome to Razekit.
        </p>
        <button
          onClick={() => { window.location.href = getPostLoginPath({ user_role: role }); }}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold hover:bg-[#0B48E8] hover:shadow-primary-glow hover:-translate-y-px active:scale-[0.98] transition-all duration-200"
        >
          Go to {label} dashboard
        </button>
      </div>
    </Center>
  );
}

function ConfirmView({ role, data, steps, step, onBack, onConfirm, creating, error }) {
  const label = role === 'client' ? 'BRAND' : 'CREATOR';
  const all = steps.flatMap((s) => s.fields);
  return (
    <Center>
      <div className="max-w-md w-full glass-card rounded-3xl p-6 card-shadow-lg animate-fade-in">
        <StepProgress steps={[...steps, { title: 'Confirm' }]} current={step} />
        <h2 className="font-heading text-xl font-bold mb-1">Confirm</h2>
        <p className="text-sm text-muted-foreground mb-4">Review your details before creating your account.</p>
        <div className="bg-white/50 rounded-xl p-4 mb-4 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Account Type</p>
          <p className="font-heading font-bold text-primary mb-3">{label}</p>
          {all.map((f) => {
            const val = data[f.key];
            if (!val) return null;
            return (
              <div key={f.key} className="flex justify-between gap-3 py-1.5 border-t border-border first:border-0">
                <span className="text-xs text-muted-foreground">{f.label}</span>
                <span className="text-xs font-medium text-right max-w-[60%] truncate">{val}</span>
              </div>
            );
          })}
        </div>
        {error && <p className="text-xs text-destructive mb-3">{error}</p>}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={onConfirm}
            disabled={creating}
            className="ml-auto flex items-center gap-1 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-[#0B48E8] hover:shadow-primary-glow hover:-translate-y-px active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : `Create ${label === 'BRAND' ? 'Brand' : 'Creator'} Account`}
          </button>
        </div>
      </div>
    </Center>
  );
}