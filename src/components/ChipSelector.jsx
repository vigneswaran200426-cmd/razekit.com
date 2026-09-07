import React from "react";
import { cn } from "@/lib/utils";

export default function ChipSelector({ options, value, onChange, allowCustom = false, customValue, onCustomChange, customPlaceholder = "Type your custom value..." }) {
  const isCustom = value === "Custom";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {allowCustom && isCustom && (
        <input
          type="text"
          value={customValue || ""}
          onChange={(e) => onCustomChange?.(e.target.value)}
          placeholder={customPlaceholder}
          className="mt-3 w-full px-4 py-2.5 rounded-xl bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
        />
      )}
    </div>
  );
}