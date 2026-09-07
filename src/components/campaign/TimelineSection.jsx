import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';
import { TIMEZONES, toLocalInputValue } from '@/lib/campaign-brief';

export default function TimelineSection({ data, update }) {
  const invalidStart = data.deadline && data.start_date && new Date(`${data.start_date}T${data.start_time || '00:00'}`) >= new Date(data.deadline);

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>Start Date</Label>
          <Input className="bg-background" type="date" value={data.start_date || ''} onChange={(e) => update({ start_date: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Start Time</Label>
          <Input className="bg-background" type="time" value={data.start_time || ''} onChange={(e) => update({ start_time: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Submission Deadline *</Label>
          <Input className="bg-background" type="datetime-local" value={toLocalInputValue(data.deadline)}
            onChange={(e) => update({ deadline: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <select className="h-10 w-full rounded-md border border-input px-3 text-sm bg-background" value={data.timezone || 'UTC'} onChange={(e) => update({ timezone: e.target.value })}>
            {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {invalidStart && (
        <p className="flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="w-4 h-4" /> Start must be before the submission deadline.</p>
      )}
    </div>
  );
}