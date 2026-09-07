import React from "react";
import { Link2, FileText, FolderOpen, Check, AlertCircle } from "lucide-react";
import { isValidGoogleDriveLink } from "@/lib/contest-utils";
import { Button } from "@/components/ui/button";

export default function Step1SourceFiles({ data, update, onNext }) {
  const driveValid = isValidGoogleDriveLink(data.google_drive_link);

  return (
    <div className="space-y-6">
      {/* Google Drive Link */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <FolderOpen className="w-4 h-4 text-primary" />
          Google Drive Link <span className="text-destructive">*</span>
        </label>
        <p className="text-xs text-muted-foreground mb-3">Upload your source files to Google Drive and paste the shared link here.</p>
        <div className="relative">
          <input
            type="url"
            value={data.google_drive_link || ""}
            onChange={(e) => update("google_drive_link", e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="w-full px-4 py-3 pr-10 rounded-xl bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
          {data.google_drive_link && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {driveValid ? (
                <Check className="w-4.5 h-4.5 text-green-400" style={{ width: 18, height: 18 }} />
              ) : (
                <AlertCircle className="w-4.5 h-4.5 text-destructive" style={{ width: 18, height: 18 }} />
              )}
            </div>
          )}
        </div>
        {data.google_drive_link && !driveValid && (
          <p className="text-xs text-destructive mt-1.5">Please enter a valid Google Drive link.</p>
        )}
      </div>

      {/* Reference Links */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <Link2 className="w-4 h-4 text-primary" />
          Reference Links <span className="text-muted-foreground font-normal">(Optional)</span>
        </label>
        <p className="text-xs text-muted-foreground mb-3">Add inspiration or reference video links for creators.</p>
        <textarea
          value={data.reference_links || ""}
          onChange={(e) => update("reference_links", e.target.value)}
          placeholder={"https://youtube.com/watch?v=...\nhttps://vimeo.com/..."}
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all resize-none"
        />
      </div>

      {/* Additional Notes */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <FileText className="w-4 h-4 text-primary" />
          Additional Notes <span className="text-muted-foreground font-normal">(Optional)</span>
        </label>
        <p className="text-xs text-muted-foreground mb-3">Any extra context or instructions for creators.</p>
        <textarea
          value={data.additional_notes || ""}
          onChange={(e) => update("additional_notes", e.target.value)}
          placeholder="e.g. Please use the raw footage in the 'Main' folder..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all resize-none"
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={onNext}
          disabled={!driveValid}
          className="px-8"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}