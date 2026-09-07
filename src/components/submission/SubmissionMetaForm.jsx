import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Check } from 'lucide-react';

const REQUIREMENTS = [
  'Video duration matches the project brief',
  'Resolution and format meet project requirements',
  'All required assets and deliverables are included',
  'No missing, corrupted, or placeholder files',
];

export default function SubmissionMetaForm({ values, onChange, confirmed, setConfirmed }) {
  const set = (k, v) => onChange({ ...values, [k]: v });

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1.5 block">Submission title</Label>
        <Input
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Final cut — v2"
        />
      </div>
      <div>
        <Label className="mb-1.5 block">Short description</Label>
        <Textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          placeholder="Briefly describe this version"
        />
      </div>
      <div>
        <Label className="mb-1.5 block">Version</Label>
        <Input
          value={values.version}
          onChange={(e) => set('version', e.target.value)}
          placeholder="1"
        />
      </div>
      <div>
        <Label className="mb-1.5 block">Notes for brand (optional)</Label>
        <Textarea
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          placeholder="Anything the brand should know"
        />
      </div>
      <div className="bg-secondary/40 border border-border rounded-xl p-3.5">
        <p className="text-xs font-semibold mb-2">Confirm requirements</p>
        <ul className="space-y-1.5">
          {REQUIREMENTS.map((r) => (
            <li key={r} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Check className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
        <label className="flex items-start gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded mt-0.5"
          />
          <span className="text-xs">
            I confirm that this submission follows the project requirements.
          </span>
        </label>
      </div>
    </div>
  );
}