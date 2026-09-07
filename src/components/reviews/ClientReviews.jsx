import { useEffect, useState } from 'react';
import { ShieldCheck, MessageSquare } from 'lucide-react';
import { getCreatorReviews, getClientReviews, summarizeReviews, REVIEW_CATEGORIES, CLIENT_REVIEW_CATEGORIES } from '@/lib/review-utils';
import StarRating from '@/components/reviews/StarRating';

// Public reputation surface — verified two-sided reviews.
// subject 'creator' (default) → client reviews about a creator.
// subject 'client'            → creator reviews about a client.
export default function ClientReviews({ subject = 'creator', creatorId, clientId }) {
  const isClientSubject = subject === 'client';
  const targetId = isClientSubject ? clientId : creatorId;
  const [reviews, setReviews] = useState(null);
  useEffect(() => {
    (isClientSubject ? getClientReviews(targetId) : getCreatorReviews(targetId)).then(setReviews);
  }, [targetId, isClientSubject]);

  const categories = isClientSubject ? CLIENT_REVIEW_CATEGORIES : REVIEW_CATEGORIES;

  if (reviews === null) return <div className="h-28 bg-card border border-border rounded-2xl animate-pulse" />;
  const s = summarizeReviews(reviews, categories);

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-lg font-semibold px-1">{isClientSubject ? 'Creator Reviews' : 'Brand Reviews'}</h2>

      <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
        {s.count === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            {isClientSubject ? 'No creator reviews yet.' : 'No brand reviews yet.'}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="text-center shrink-0">
                <p className="font-heading text-3xl font-bold leading-none">{s.average.toFixed(1)}</p>
                <div className="mt-1 flex justify-center"><StarRating value={Math.round(s.average)} readOnly size="sm" /></div>
                <p className="text-xs text-muted-foreground mt-1">{s.count} verified review{s.count === 1 ? '' : 's'}</p>
              </div>
              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const n = s.distribution[star - 1];
                  const pct = s.count ? (n / s.count) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-3 text-muted-foreground">{star}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                      <span className="w-5 text-right text-muted-foreground">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {s.wouldWorkAgainPct > 0 && (
              <p className="text-xs text-center text-muted-foreground mt-3">
                {s.wouldWorkAgainPct}% of {isClientSubject ? 'creators' : 'brands'} would work with this {isClientSubject ? 'brand' : 'creator'} again
              </p>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4 pt-4 border-t border-border/60">
              {categories.map((c) => (
                <div key={c.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-semibold">{(s.categories[c.key] || 0).toFixed(1)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {reviews.slice(0, 5).map((r) => (
        <div key={r.id} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <StarRating value={Math.round(r.overall_rating)} readOnly size="sm" />
            {r.verified && <span className="inline-flex items-center gap-1 text-[11px] text-success"><ShieldCheck className="w-3.5 h-3.5" /> Verified {isClientSubject ? 'Creator' : 'Brand'}</span>}
          </div>
          {r.review_text && <p className="text-sm text-foreground/90">{r.review_text}</p>}
          {(r.creator_reply || r.review_reply) && (
            <div className="mt-2 pl-3 border-l-2 border-primary/30">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {isClientSubject ? 'Brand replied' : 'Creator replied'}</p>
              <p className="text-sm text-muted-foreground">{r.creator_reply || r.review_reply}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}