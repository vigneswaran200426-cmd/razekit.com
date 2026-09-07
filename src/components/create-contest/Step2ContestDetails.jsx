import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import ChipSelector from "@/components/ChipSelector";
import { CATEGORIES, EDITING_STYLES, VIDEO_DURATIONS, SOFTWARE_OPTIONS } from "@/lib/contest-utils";

export default function Step2ContestDetails({ data, update, onNext, onBack }) {
  const canProceed = data.title?.trim() && data.description?.trim() && data.category && data.editing_style && data.video_duration
    && (data.editing_style !== "Custom" || data.custom_editing_style?.trim())
    && (data.video_duration !== "Custom" || data.custom_duration?.trim());

  return (
    <div className="space-y-6">
      {/* Contest Title */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Contest Title <span className="text-destructive">*</span></Label>
        <Input
          value={data.title || ""}
          onChange={(e) => update("title", e.target.value)}
          placeholder="e.g. Instagram Reel for Travel Brand"
          className="bg-input"
        />
      </div>

      {/* Project Description */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Project Description <span className="text-destructive">*</span></Label>
        <p className="text-xs text-muted-foreground mb-2">Describe the story, mood, editing expectations, audience, and platform.</p>
        <Textarea
          value={data.description || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Describe exactly what the creator should make..."
          rows={4}
          className="bg-input resize-none"
        />
      </div>

      {/* Category */}
      <div>
        <Label className="text-sm font-medium mb-3 block">Category <span className="text-destructive">*</span></Label>
        <ChipSelector
          options={CATEGORIES}
          value={data.category || ""}
          onChange={(v) => update("category", v)}
        />
      </div>

      {/* Editing Style */}
      <div>
        <Label className="text-sm font-medium mb-3 block">Editing Style <span className="text-destructive">*</span></Label>
        <ChipSelector
          options={EDITING_STYLES}
          value={data.editing_style || ""}
          onChange={(v) => update("editing_style", v)}
          allowCustom={true}
          customValue={data.custom_editing_style}
          onCustomChange={(v) => update("custom_editing_style", v)}
          customPlaceholder="e.g. Fast transitions with emotional storytelling"
        />
      </div>

      {/* Video Duration */}
      <div>
        <Label className="text-sm font-medium mb-3 block">Video Duration <span className="text-destructive">*</span></Label>
        <ChipSelector
          options={VIDEO_DURATIONS}
          value={data.video_duration || ""}
          onChange={(v) => update("video_duration", v)}
          allowCustom={true}
          customValue={data.custom_duration}
          onCustomChange={(v) => update("custom_duration", v)}
          customPlaceholder="e.g. 2 Minutes 15 Seconds"
        />
      </div>

      {/* Preferred Software */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Preferred Editing Software <span className="text-muted-foreground font-normal">(Optional)</span></Label>
        <select
          value={data.preferred_software || "Any Software"}
          onChange={(e) => update("preferred_software", e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
        >
          {SOFTWARE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Contest Rules */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Contest Rules <span className="text-muted-foreground font-normal">(Optional)</span></Label>
        <Textarea
          value={data.contest_rules || ""}
          onChange={(e) => update("contest_rules", e.target.value)}
          placeholder={"e.g. No copyrighted music.\nDeliver in 4K.\nUse smooth transitions."}
          rows={3}
          className="bg-input resize-none"
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!canProceed} className="px-8">Continue</Button>
      </div>
    </div>
  );
}