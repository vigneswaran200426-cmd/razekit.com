import { useState, useEffect, useRef } from 'react';
import { Shield, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CountdownDisplay from './CountdownDisplay';

export default function OtpInputModal({ expiresAt, onVerify, onCancel, maxAttempts = 3, attempts = 0 }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputs = useRef([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const newCode = [...code];
    newCode[i] = val;
    setCode(newCode);
    if (val && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handleVerify = async () => {
    const otp = code.join('');
    if (otp.length !== 6) { setError('Enter all 6 digits'); return; }
    setVerifying(true);
    setError('');
    try {
      await onVerify(otp);
    } catch (e) {
      setError(e.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const remaining = maxAttempts - attempts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-heading font-bold">Verify Approval</h3>
          </div>
          <button onClick={onCancel}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">Enter the 6-digit code sent to your email to confirm approval.</p>
        <div className="flex items-center gap-2 mb-4 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground">Code expires in</span>
          <CountdownDisplay expiresAt={expiresAt} onExpire={onCancel} className="text-sm font-bold text-primary ml-auto" />
        </div>
        <div className="flex gap-2 mb-4 justify-center">
          {code.map((d, i) => (
            <input key={i} ref={el => inputs.current[i] = el} type="text" inputMode="numeric" maxLength="1"
              value={d} onChange={e => handleChange(i, e.target.value)} onKeyDown={e => handleKeyDown(i, e)}
              className="w-11 h-14 text-center text-xl font-bold bg-input border border-border rounded-lg focus:border-primary focus:outline-none text-foreground" />
          ))}
        </div>
        {error && <p className="text-sm text-destructive mb-3 text-center">{error}</p>}
        {remaining > 0 && <p className="text-xs text-muted-foreground text-center mb-4">{remaining} attempt{remaining !== 1 ? 's' : ''} remaining</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={handleVerify} disabled={verifying || code.join('').length !== 6} className="flex-1">
            {verifying ? 'Verifying...' : 'Verify & Approve'}
          </Button>
        </div>
      </div>
    </div>
  );
}