import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PillSelect from './PillSelect';

const CATEGORIES = ["Instagram Reel", "YouTube Shorts", "YouTube Video", "Advertisement", "Gaming", "Wedding", "Documentary", "Corporate", "Travel", "Music Video"];
const EDITING_STYLES = ["Cinematic", "Fast Pace", "Minimal", "Storytelling", "Luxury", "Commercial", "Viral", "Vlog", "Gaming"];
const DURATIONS = ["15 Seconds", "30 Seconds", "45 Seconds", "60 Seconds", "90 Seconds", "3 Minutes", "5 Minutes", "10 Minutes"];
const SOFTWARE = ["Any", "CapCut", "Premiere Pro", "After Effects", "DaVinci Resolve", "Final Cut Pro", "VN", "Alight Motion"];

export default function Step2ContestDetails({ formData, updateFormData }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-heading text-xl font-bold mb-1">Contest Details</h2>
        <p className="text-sm text-muted-foreground">Describe what the creator should make.</p>
      </div>

      <div className="space-y-2">
        <Label>Contest Title *</Label>
        <Input value={formData.title || ''} onChange={(e) => updateFormData({ title: e.target.value })}
          placeholder="Instagram Reel for Travel Brand" className="bg-input" />
      </div>

      <div className="space-y-2">
        <Label>Project Description *</Label>
        <Textarea value={formData.description || ''} onChange={(e) => updateFormData({ description: e.target.value })}
          placeholder="Describe story, mood, editing expectations, audience..." rows={4} className="bg-input" />
      </div>

      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={formData.category} onValueChange={(v) => updateFormData({ category: v })}>
          <SelectTrigger className="bg-input"><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Editing Style *</Label>
        <PillSelect options={EDITING_STYLES} value={formData.editing_style}
          onChange={(v) => updateFormData({ editing_style: v })}
          allowCustom
          customValue={formData.custom_editing_style}
          onCustomChange={(v) => updateFormData({ custom_editing_style: v })}
          customPlaceholder="e.g. Fast transitions with emotional storytelling" />
      </div>

      <div className="space-y-2">
        <Label>Video Duration *</Label>
        <PillSelect options={DURATIONS} value={formData.video_duration}
          onChange={(v) => updateFormData({ video_duration: v })}
          allowCustom
          customValue={formData.custom_duration}
          onCustomChange={(v) => updateFormData({ custom_duration: v })}
          customPlaceholder="e.g. 2 Minutes 15 Seconds" />
      </div>

      <div className="space-y-2">
        <Label>Preferred Editing Software (Optional)</Label>
        <Select value={formData.preferred_software || 'Any'} onValueChange={(v) => updateFormData({ preferred_software: v })}>
          <SelectTrigger className="bg-input"><SelectValue placeholder="Any software" /></SelectTrigger>
          <SelectContent>
            {SOFTWARE.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Contest Rules (Optional)</Label>
        <Textarea value={formData.contest_rules || ''} onChange={(e) => updateFormData({ contest_rules: e.target.value })}
          placeholder="e.g. No copyrighted music. Deliver in 4K. Maintain original aspect ratio." rows={3} className="bg-input" />
      </div>
    </div>
  );
}