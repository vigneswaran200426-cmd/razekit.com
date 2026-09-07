import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { X, Loader2, Paperclip } from 'lucide-react';
import { fileReport } from '@/lib/enforcement-utils';

const CATEGORIES = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment / Abuse' },
  { value: 'fraud', label: 'Fraud / Scam' },
  { value: 'copyright', label: 'Copyright / Content theft' },
  { value: 'misleading', label: 'Misleading info' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'platform_abuse', label: 'Platform abuse' },
  { value: 'payment_abuse', label: 'Payment abuse' },
  { value: 'footage_misuse', label: 'Footage misuse' },
  { value: 'fake_account', label: 'Fake account' },
  { value: 'other', label: 'Other' },
];

const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export default function ReportModal({ open, onClose, targetType, targetId, reportedUserId, user }) {
  const [category, setCategory] = useState('spam');
  const [severity, setSeverity] = useState('medium');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!reason.trim() || !user) { toast({ title: 'Add a reason', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      let evidenceUrl = '';
      if (file) {
        const up = await base44.integrations.Core.UploadFile({ file });
        evidenceUrl = up?.file_url || '';
      }
      await fileReport({ user, targetType, targetId, reportedUserId, category, severity, reason, evidenceUrl });
      toast({ title: 'Report submitted', description: 'Our Trust & Safety team will review it.' });
      setReason(''); setFile(null);
      onClose();
    } catch (e) {
      toast({ title: 'Failed to submit', description: e.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-card border border-border rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold">Report {targetType}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.value} onClick={() => setCategory(c.value)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${category === c.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{c.label}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Severity</p>
          <div className="flex flex-wrap gap-2">
            {SEVERITIES.map((s) => (
              <button key={s.value} onClick={() => setSeverity(s.value)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${severity === s.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Reason</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Tell us what's wrong..." className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Evidence (optional)</p>
          <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-input cursor-pointer text-sm text-muted-foreground">
            <Paperclip className="w-4 h-4" /> {file ? file.name : 'Attach a screenshot'}
            <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>
        <Button onClick={submit} disabled={submitting} className="w-full h-10">
          {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : 'Submit report'}
        </Button>
      </div>
    </div>
  );
}