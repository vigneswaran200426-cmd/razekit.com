import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Large, spacious form field wrapper: label + control + compact helper / error.
export default function FormField({ label, hint, error, required, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label className="text-sm font-semibold text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-destructive font-medium">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}