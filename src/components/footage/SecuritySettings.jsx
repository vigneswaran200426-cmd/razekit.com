import { useState } from 'react';
import { Shield, KeyRound, RefreshCw, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function SecuritySettings({ formData, updateFormData }) {
  const [otpConfirm, setOtpConfirm] = useState('');
  const [otpMismatch, setOtpMismatch] = useState(false);

  const handleOtpChange = (val) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 6);
    updateFormData({ otp_code: cleaned });
    setOtpMismatch(otpConfirm && cleaned !== otpConfirm);
  };

  const handleOtpConfirmChange = (val) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 6);
    setOtpConfirm(cleaned);
    setOtpMismatch(cleaned !== formData.otp_code);
  };

  const handleResetOtp = () => {
    updateFormData({ otp_code: '' });
    setOtpConfirm('');
    setOtpMismatch(false);
  };

  const otpValid = formData.otp_code?.length === 6 && otpConfirm === formData.otp_code;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-primary" />
        <div>
          <h3 className="font-heading font-semibold">Footage Security</h3>
          <p className="text-sm text-muted-foreground">Control who can access your footage with a manual OTP.</p>
        </div>
      </div>

      {/* Manual OTP */}
      <div className="bg-input/50 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <Label className="text-sm font-medium">Manual OTP</Label>
        </div>
        <p className="text-xs text-muted-foreground">Create a 6-digit access code. Editors must enter this code to view your footage.</p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={formData.otp_code || ''}
          onChange={(e) => handleOtpChange(e.target.value)}
          placeholder="e.g., 784215"
          className="w-full bg-input border border-border rounded-lg px-4 py-3 text-2xl font-mono tracking-[0.5em] text-center focus:outline-none focus:border-primary"
        />
        <div>
          <Label className="text-xs text-muted-foreground">Confirm OTP</Label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpConfirm}
            onChange={(e) => handleOtpConfirmChange(e.target.value)}
            placeholder="Re-enter code"
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-2xl font-mono tracking-[0.5em] text-center focus:outline-none focus:border-primary mt-1"
          />
        </div>
        {otpMismatch && (
          <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> OTP codes don't match</p>
        )}
        {otpValid && (
          <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OTP confirmed</p>
        )}
        <button onClick={handleResetOtp} className="text-xs text-primary flex items-center gap-1 hover:underline">
          <RefreshCw className="w-3 h-3" /> Reset OTP
        </button>
      </div>

      {/* Approve Requests */}
      <div className="flex items-center justify-between bg-input/50 border border-border rounded-xl p-3">
        <div className="flex-1 min-w-0 pr-3">
          <Label className="text-sm font-medium">Approve Requests</Label>
          <p className="text-xs text-muted-foreground">Editors must request access — you approve each request manually.</p>
        </div>
        <Switch checked={!!formData.manual_approval} onCheckedChange={(v) => updateFormData({ manual_approval: v })} />
      </div>

      {/* Maximum Editors */}
      <div className="bg-input/50 border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-primary" />
          <Label className="text-sm font-medium">Maximum Editors Allowed (Optional)</Label>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Limit how many editors can be approved. Leave blank for unlimited.</p>
        <input
          type="number"
          min="1"
          max="100"
          value={formData.max_editors || ''}
          onChange={(e) => updateFormData({ max_editors: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder="No limit"
          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {/* Disable OTP After Contest Ends */}
      <div className="flex items-center justify-between bg-input/50 border border-border rounded-xl p-3">
        <div className="flex-1 min-w-0 pr-3">
          <Label className="text-sm font-medium">Disable OTP After Contest Ends</Label>
          <p className="text-xs text-muted-foreground">Editors lose footage access when the contest completes.</p>
        </div>
        <Switch checked={!!formData.auto_hide_drive_link} onCheckedChange={(v) => updateFormData({ auto_hide_drive_link: v })} />
      </div>

      {/* Maximum Downloads */}
      <div className="bg-input/50 border border-border rounded-xl p-3">
        <Label className="text-sm font-medium">Maximum downloads per editor</Label>
        <p className="text-xs text-muted-foreground mb-2">How many times an approved editor can open the footage.</p>
        <div className="flex items-center gap-3">
          <input type="number" min="1" max="10" value={formData.max_downloads || 1}
            onChange={(e) => updateFormData({ max_downloads: parseInt(e.target.value) || 1 })}
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          <span className="text-xs text-muted-foreground">download{formData.max_downloads !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}