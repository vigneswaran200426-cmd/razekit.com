import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, XCircle, Link2 } from 'lucide-react';
import SecuritySettings from '@/components/footage/SecuritySettings';

export default function Step1SourceFiles({ formData, updateFormData }) {
  const validateDriveLink = (url) => {
    const isValid = (url.includes('drive.google.com') || url.includes('docs.google.com')) && url.startsWith('http');
    updateFormData({ drive_link: url, drive_link_valid: isValid });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-heading text-xl font-bold mb-1">Source Files</h2>
        <p className="text-sm text-muted-foreground">Provide your source files and references for creators.</p>
      </div>

      <div className="space-y-2">
        <Label>Google Drive Link *</Label>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={formData.drive_link} onChange={(e) => validateDriveLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..." className="pl-10 bg-input" />
        </div>
        {formData.drive_link && (
          <div className="flex items-center gap-1.5 text-sm">
            {formData.drive_link_valid ? (
              <><CheckCircle2 className="w-4 h-4 text-success" /><span className="text-success">Valid link format</span></>
            ) : (
              <><XCircle className="w-4 h-4 text-destructive" /><span className="text-destructive">Invalid link — must be a Google Drive URL</span></>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Reference Links (Optional)</Label>
        <Textarea value={formData.reference_links || ''} onChange={(e) => updateFormData({ reference_links: e.target.value })}
          placeholder="Add any reference links, one per line..." rows={3} className="bg-input" />
      </div>

      <div className="space-y-2">
        <Label>Additional Notes (Optional)</Label>
        <Textarea value={formData.additional_notes || ''} onChange={(e) => updateFormData({ additional_notes: e.target.value })}
          placeholder="Any additional instructions for creators..." rows={3} className="bg-input" />
      </div>

      <SecuritySettings formData={formData} updateFormData={updateFormData} />
    </div>
  );
}