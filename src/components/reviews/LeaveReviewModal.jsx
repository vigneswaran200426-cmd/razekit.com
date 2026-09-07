import { useState } from 'react';
import { X, ShieldCheck, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  REVIEW_CATEGORIES, CLIENT_REVIEW_CATEGORIES,
  hasClientReviewedCreator, hasCreatorReviewedClient,
} from '@/lib/review-utils';
import StarRating from '@/components/reviews/StarRating';
import { useToast } from '@/components/ui/use-toast';

// Verified two-sided review of a completed contest.
// direction 'creator' → a client rates the winning creator.
// direction 'client'   → the winning creator rates the client.
export default function LeaveReviewModal({ contest, direction = 'creator', creatorId, clientId, onClose, onSubmitted }) {
  const { toast } = useToast();
  const isClientReview = direction === 'client';
  const categories = isClientReview ? CLIENT_REVIEW_CATEGORIES : REVIEW_CATEGORIES;
  const [overall, setOverall] = useState(0);
  const [cats, setCats] = useState({});
  const [wouldWorkAgain, setWouldWorkAgain] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const setCat = (k, v) => setCats((c) => ({ ...c, [k]: v }));

  const submit = async () => {
    if (!overall) { toast({ title: 'Add an overall rating first', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (isClientReview
        ? await hasCreatorReviewedClient(creatorId, contest.id)
        : await hasClientReviewedCreator(clientId, contest.id)) {
        toast({ title: 'Already reviewed', description: 'You have already reviewed this contest.', variant: 'destructive' });
        onClose?.(); return;
      }
      const payload = {
        reviewer_role: isClientReview ? 'creator' : 'client',
        creator_id: creatorId, client_id: clientId, contest_id: contest.id,
        overall_rating: overall, would_work_again: wouldWorkAgain,
        review_text: text.trim(), verified: true, status: 'published',
      };
      categories.forEach((c) => { payload[c.key] = cats[c.key] || overall; });
      await base44.entities.Review.create(payload);
      toast({ title: 'Review submitted', description: 'Thanks for your verified feedback.' });
      onSubmitted?.(); onClose?.();
    } catch (e) {
      toast({ title: 'Could not submit', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <h3 className="font-heading font-bold">{isClientReview ? 'Rate this brand' : 'Rate this creator'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Overall rating</p>
            <div className="flex justify-center"><StarRating value={overall} onChange={setOverall} size="lg" /></div>
          </div>
          <div className="space-y-2 pt-2 border-t border-border/60">
            {categories.map((c) => (
              <div key={c.key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <StarRating value={cats[c.key] || 0} onChange={(v) => setCat(c.key, v)} size="sm" />
              </div>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder={isClientReview ? 'Share your experience working with this brand...' : 'Share your experience working with this creator...'}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wouldWorkAgain} onChange={(e) => setWouldWorkAgain(e.target.checked)} className="rounded border-border" />
            {isClientReview ? 'I would work with this brand again' : 'I would work with this creator again'}
          </label>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-success" /> Verified review — tied to this completed contest.</p>
          <Button onClick={submit} disabled={saving} className="w-full h-11 font-semibold">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : 'Submit Review'}
          </Button>
        </div>
      </div>
    </div>
  );
}