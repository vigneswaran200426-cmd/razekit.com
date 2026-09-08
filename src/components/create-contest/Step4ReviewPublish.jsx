import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Trophy, Wallet, Edit3, CheckCircle2, Circle, Film, Clock, Check } from "lucide-react";
import { formatINR, calcPlatformFee, calcTotalCost, isValidGoogleDriveLink } from "@/lib/contest-utils";
import CountdownTimer from "@/components/CountdownTimer";

export default function Step4ReviewPublish({ data, balance, onBack, onEditStep, onPublish, onSaveDraft, publishing }) {
  const [savedDraft, setSavedDraft] = useState(false);

  const driveValid = isValidGoogleDriveLink(data.google_drive_link);
  const editingStyle = data.editing_style === "Custom" ? data.custom_editing_style : data.editing_style;
  const duration = data.video_duration === "Custom" ? data.custom_duration : data.video_duration;
  const fee = calcPlatformFee(data.prize_amount);
  const total = calcTotalCost(data.prize_amount);
  const sufficient = balance >= total;
  const remaining = balance - total;

  const checklist = [
    { label: "Google Drive link is valid", done: driveValid },
    { label: "Contest title entered", done: !!data.title?.trim() },
    { label: "Description entered", done: !!data.description?.trim() },
    { label: "Category selected", done: !!data.category },
    { label: "Prize entered", done: !!data.prize_amount },
    { label: "Deadline selected", done: !!data.deadline },
    { label: "Sufficient wallet balance available", done: sufficient },
  ];
  const allDone = checklist.every((c) => c.done);

  const handleSaveDraft = async () => {
    setSavedDraft(true);
    await onSaveDraft?.();
    setTimeout(() => setSavedDraft(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Source Files */}
      <ReviewCard title="Source Files" icon={FileText} onEdit={() => onEditStep(1)}>
        <Row label="Google Drive Link">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${driveValid ? "bg-green-500/15 text-green-400" : "bg-destructive/15 text-destructive"}`}>
            {driveValid ? "Valid" : "Invalid"}
          </span>
        </Row>
        <p className="text-xs text-muted-foreground truncate max-w-full">{data.google_drive_link || "—"}</p>
        {data.reference_links && <Row label="Reference Links"><span className="text-xs">Provided</span></Row>}
        {data.additional_notes && <Row label="Additional Notes"><span className="text-xs">Provided</span></Row>}
      </ReviewCard>

      {/* Contest Details */}
      <ReviewCard title="Contest Details" icon={Film} onEdit={() => onEditStep(2)}>
        <Row label="Title"><span className="text-sm">{data.title}</span></Row>
        <Row label="Description"><span className="text-xs line-clamp-2">{data.description}</span></Row>
        <Row label="Category"><span className="text-xs">{data.category}</span></Row>
        <Row label="Editing Style"><span className="text-xs">{editingStyle || "—"}</span></Row>
        <Row label="Video Duration"><span className="text-xs">{duration || "—"}</span></Row>
        <Row label="Preferred Software"><span className="text-xs">{data.preferred_software || "Any Software"}</span></Row>
        {data.contest_rules && <Row label="Contest Rules"><span className="text-xs line-clamp-2">{data.contest_rules}</span></Row>}
      </ReviewCard>

      {/* Prize & Deadline */}
      <ReviewCard title="Prize & Deadline" icon={Trophy} onEdit={() => onEditStep(3)}>
        <Row label="Prize Amount"><span className="font-bold" style={{ color: "hsl(var(--money))" }}>{formatINR(data.prize_amount)}</span></Row>
        <Row label="Platform Fee"><span className="text-sm">{formatINR(fee)}</span></Row>
        <Row label="Total Payment"><span className="font-semibold text-foreground">{formatINR(total)}</span></Row>
        <Row label="Contest Deadline">
          <span className="text-sm">{data.deadline ? new Date(data.deadline).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
        </Row>
        {data.deadline && (
          <div className="flex items-center gap-2 pt-1">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <CountdownTimer targetDate={data.deadline} compact />
          </div>
        )}
      </ReviewCard>

      {/* Funds Summary */}
      <ReviewCard title="Wallet Summary" icon={Wallet}>
        <Row label="Available Balance"><span className={`font-semibold ${sufficient ? "text-green-400" : "text-destructive"}`}>{formatINR(balance)}</span></Row>
        <Row label="Reserved Amount"><span className="text-sm text-destructive">−{formatINR(total)}</span></Row>
        <Row label="Remaining After Publishing"><span className={`font-semibold ${remaining >= 0 ? "text-foreground" : "text-destructive"}`}>{formatINR(remaining)}</span></Row>
        {!sufficient && (
          <div className="mt-2 text-xs text-destructive font-medium">⚠ Insufficient wallet balance — please add money before publishing.</div>
        )}
      </ReviewCard>

      {/* Contest Preview */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">Contest Preview (how creators see it)</h4>
        <div className="rounded-2xl bg-card border border-border overflow-hidden max-w-sm">
          <div className="h-28 bg-gradient-to-br from-secondary via-accent to-card flex items-center justify-center">
            <Film className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <div className="p-4 space-y-2">
            <div className="flex justify-between items-start gap-2">
              <h5 className="font-semibold text-sm text-foreground line-clamp-2">{data.title || "Untitled Contest"}</h5>
              <span className="text-sm font-bold shrink-0" style={{ color: "hsl(var(--money))" }}>{formatINR(data.prize_amount)}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{data.category}</span>
              <span>•</span>
              <span>{editingStyle}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {data.deadline && <CountdownTimer targetDate={data.deadline} compact />}
            </div>
            <div className="pt-2 mt-2 border-t border-border">
              <span className="text-xs text-muted-foreground/60 italic">Join Contest (preview)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Final Checklist */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Final Checklist</h4>
        <div className="space-y-2.5">
          {checklist.map((item) => (
            <div key={item.label} className="flex items-center gap-2.5">
              {item.done ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              )}
              <span className={`text-sm ${item.done ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={onBack} disabled={publishing}>Back</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={publishing || savedDraft}>
            {savedDraft ? <><Check className="w-4 h-4" /> Saved</> : "Save as Draft"}
          </Button>
          <Button onClick={onPublish} disabled={!allDone || publishing} className="px-6">
            {publishing ? (
              <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Publishing...</>
            ) : (
              <>Publish Contest</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ title, icon: Icon, onEdit, children }) {
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-accent/20">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
            <Edit3 className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      <div className="p-5 space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}