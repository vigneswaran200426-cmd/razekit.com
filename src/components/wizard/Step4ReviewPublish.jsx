import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Pencil, ExternalLink, IndianRupee, Clock, Film } from 'lucide-react';
import CountdownTimer from '../CountdownTimer';

function ReviewCard({ title, children, onEdit }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h3>
        {onEdit && <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="w-3.5 h-3.5 mr-1" />Edit</Button>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value, status }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <div className="text-right">
        <span className="font-medium break-words">{value || '—'}</span>
        {status && <span className={`ml-2 text-xs ${status === 'Valid' || status === 'Sufficient' ? 'text-success' : 'text-destructive'}`}>{status}</span>}
      </div>
    </div>
  );
}

export default function Step4ReviewPublish({ formData, availableFunds, onPublish, onEditStep, publishing }) {
  const totalCost = (formData.prize_amount || 0) + (formData.platform_fee || 0);
  const remainingBalance = availableFunds - totalCost;
  const editingStyle = formData.editing_style === 'Custom' ? formData.custom_editing_style : formData.editing_style;
  const duration = formData.video_duration === 'Custom' ? formData.custom_duration : formData.video_duration;

  const checklist = [
    { label: 'Google Drive link is valid', done: formData.drive_link_valid },
    { label: 'Contest title entered', done: !!formData.title },
    { label: 'Description entered', done: !!formData.description },
    { label: 'Category selected', done: !!formData.category },
    { label: 'Editing style selected', done: !!formData.editing_style },
    { label: 'Video duration selected', done: !!formData.video_duration },
    { label: 'Prize entered', done: (formData.prize_amount || 0) > 0 },
    { label: 'Deadline selected', done: !!formData.deadline },
    { label: 'Sufficient wallet balance available', done: remainingBalance >= 0 },
  ];
  const allValid = checklist.every(c => c.done);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-heading text-xl font-bold mb-1">Review & Publish</h2>
        <p className="text-sm text-muted-foreground">Review all details before making your contest live.</p>
      </div>

      <ReviewCard title="Source Files" onEdit={() => onEditStep(1)}>
        <Row label="Google Drive Link" value={formData.drive_link ? 'Link provided' : 'Not set'} status={formData.drive_link_valid ? 'Valid' : (formData.drive_link ? 'Invalid' : null)} />
        {formData.reference_links && <Row label="Reference Links" value={formData.reference_links} />}
        {formData.additional_notes && <Row label="Additional Notes" value={formData.additional_notes} />}
        {formData.drive_link && (
          <a href={formData.drive_link} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> Open Drive
          </a>
        )}
      </ReviewCard>

      <ReviewCard title="Contest Details" onEdit={() => onEditStep(2)}>
        <Row label="Title" value={formData.title} />
        <Row label="Description" value={formData.description} />
        <Row label="Category" value={formData.category} />
        <Row label="Editing Style" value={editingStyle} />
        <Row label="Video Duration" value={duration} />
        {formData.preferred_software && formData.preferred_software !== 'Any' && <Row label="Preferred Software" value={formData.preferred_software} />}
        {formData.contest_rules && <Row label="Contest Rules" value={formData.contest_rules} />}
      </ReviewCard>

      <ReviewCard title="Prize & Deadline" onEdit={() => onEditStep(3)}>
        <Row label="Prize Amount" value={`₹${(formData.prize_amount || 0).toLocaleString('en-IN')}`} />
        <Row label="Platform Fee" value={`₹${(formData.platform_fee || 0).toLocaleString('en-IN')}`} />
        <Row label="Total Payment" value={`₹${totalCost.toLocaleString('en-IN')}`} />
        <Row label="Deadline" value={formData.deadline ? new Date(formData.deadline).toLocaleString('en-IN') : 'Not set'} />
        {formData.deadline && <div className="text-sm text-muted-foreground">Time remaining: <CountdownTimer deadline={formData.deadline} className="text-primary font-medium" /></div>}
      </ReviewCard>

      <ReviewCard title="Wallet Summary">
        <Row label="Available Balance" value={`₹${availableFunds.toLocaleString('en-IN')}`} />
        <Row label="Reserved Amount" value={`₹${totalCost.toLocaleString('en-IN')}`} />
        <Row label="Remaining Balance" value={`₹${remainingBalance.toLocaleString('en-IN')}`} status={remainingBalance >= 0 ? 'Sufficient' : 'Insufficient'} />
        {remainingBalance < 0 && <Button variant="outline" size="sm" onClick={() => onEditStep(3)}>Add to Wallet</Button>}
      </ReviewCard>

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">Contest Preview</h3>
        <div className="bg-secondary/50 rounded-lg p-4 max-w-sm mx-auto">
          <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg flex items-center justify-center mb-3">
            <Film className="w-10 h-10 text-primary/40" />
          </div>
          <h4 className="font-heading font-semibold mb-2">{formData.title || 'Contest Title'}</h4>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
            <span className="flex items-center gap-1"><IndianRupee className="w-3 h-3" />{(formData.prize_amount || 0).toLocaleString('en-IN')}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /><CountdownTimer deadline={formData.deadline} /></span>
          </div>
          <div className="flex items-center gap-2 text-xs mb-3">
            <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{formData.category || 'Category'}</span>
            <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{editingStyle || 'Style'}</span>
          </div>
          <div className="text-center py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium">Join Contest</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">Final Checklist</h3>
        <div className="space-y-2">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {item.done ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
              <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <Button onClick={onPublish} disabled={!allValid || publishing} className="w-full" size="lg">
        {publishing ? 'Publishing...' : 'Publish Contest'}
      </Button>
    </div>
  );
}