import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Image } from '@/components/ui/image';
import { ExternalLink, Paperclip, Lock } from 'lucide-react';
import { parseJSON, formatMoney, FIXED_REQUIREMENTS } from '@/lib/campaign-brief';

export default function ContestPreviewModal({ open, onOpenChange, data }) {
  const resources = parseJSON(data.resources);
  const deliverables = parseJSON(data.deliverables);
  const customReqs = parseJSON(data.custom_requirements);
  const positions = parseJSON(data.prize_positions);
  const participation = data.private_contest ? 'Invite-only' : data.verified_creators_only ? 'Verified creators only' : 'Open to all';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle>Contest Preview</DialogTitle>
          <DialogDescription>How this campaign brief will read to creators.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {data.cover_image_url && <Image src={data.cover_image_url} alt="" className="w-full h-40 rounded-xl" fittingType="fill" />}

          <div>
            <h3 className="font-heading text-xl font-bold">{data.title || 'Untitled Contest'}</h3>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[data.category, data.contest_type].filter(Boolean).map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">{t}</span>)}
            </div>
            {data.short_description && <p className="text-muted-foreground mt-2">{data.short_description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="border border-border rounded-xl p-3"><p className="text-muted-foreground">Award Pool</p><p className="font-semibold text-base">{formatMoney(data.prize_amount)}</p></div>
            <div className="border border-border rounded-xl p-3"><p className="text-muted-foreground">Deadline</p><p className="font-semibold">{data.deadline ? new Date(data.deadline).toLocaleString() : '—'}</p></div>
            <div className="border border-border rounded-xl p-3"><p className="text-muted-foreground">Participants</p><p className="font-semibold">{participation}</p></div>
            <div className="border border-border rounded-xl p-3"><p className="text-muted-foreground">Winners</p><p className="font-semibold">{data.number_of_winners || 1}</p></div>
          </div>

          {data.brief && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Campaign Brief</p>
              <div className="max-w-none border border-border rounded-xl p-4 bg-card leading-relaxed [&_h2]:text-base [&_h2]:font-heading [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-accent [&_a]:underline" dangerouslySetInnerHTML={{ __html: data.brief }} />
            </div>
          )}

          {deliverables.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Deliverables</p>
              <div className="space-y-1.5">
                {deliverables.map((d) => (
                  <div key={d.id} className="border border-border rounded-xl p-3 bg-card">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{[d.content_type, d.platform, d.duration, d.aspect_ratio, d.resolution, d.file_format].filter(Boolean).join(' · ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resources.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Resources</p>
              <div className="space-y-1.5">
                {resources.map((r) => (
                  <div key={r.id} className="border border-border rounded-xl p-3 bg-card flex items-center gap-2">
                    {r.kind === 'link' ? <ExternalLink className="w-3.5 h-3.5 text-accent shrink-0" /> : <Paperclip className="w-3.5 h-3.5 text-accent shrink-0" />}
                    <span className="flex-1 min-w-0 truncate">{r.title} <span className="text-muted-foreground text-xs">· {r.type} · {r.permission}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Submission Requirements</p>
            <div className="space-y-1">
              {FIXED_REQUIREMENTS.map((r) => (
                <p key={r} className="text-xs text-muted-foreground flex items-start gap-1.5"><Lock className="w-3 h-3 mt-0.5 shrink-0" /> {r}</p>
              ))}
              {customReqs.map((r) => (
                <p key={r.id} className="text-xs flex items-start gap-1.5"><span className="text-accent mt-px">•</span> {r.text}</p>
              ))}
            </div>
          </div>

          {positions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Award Distribution</p>
              <div className="flex flex-wrap gap-1.5">
                {positions.map((p) => (
                  <span key={p.position} className="text-xs px-2.5 py-1 rounded-full bg-secondary font-medium">#{p.position}: {formatMoney(p.amount)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}