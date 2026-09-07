import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const stepLabels = ["Source Files", "Contest Details", "Prize & Deadline", "Review & Publish"];

export default function StepProgress({ currentStep }) {
  return (
    <div className="w-full">
      {/* Mobile: compact indicator */}
      <div className="md:hidden flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          Step {currentStep} of {stepLabels.length}
        </span>
        <span className="text-sm font-semibold text-foreground">{stepLabels[currentStep - 1]}</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {stepLabels.map((label, idx) => {
          const stepNum = idx + 1;
          const isComplete = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <React.Fragment key={label}>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={cn(
                    "w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0",
                    isComplete && "bg-primary text-primary-foreground",
                    isActive && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    !isComplete && !isActive && "bg-accent text-muted-foreground border border-border"
                  )}
                >
                  {isComplete ? <Check className="w-3.5 h-3.5" /> : stepNum}
                </div>
                <span className={cn(
                  "hidden md:block text-xs font-medium whitespace-nowrap",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}>
                  {label}
                </span>
              </div>
              {idx < stepLabels.length - 1 && (
                <div className={cn("flex-1 h-0.5 rounded-full transition-all duration-300", isComplete ? "bg-primary" : "bg-border")} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}