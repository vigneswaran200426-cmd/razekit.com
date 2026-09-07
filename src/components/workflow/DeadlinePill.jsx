import { Clock } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';

// Deadline display — shown only where a deadline is relevant (WORKFLOWS §28).
export default function DeadlinePill({ deadline, label = 'Deadline' }) {
  if (!deadline) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      {label}
      <CountdownTimer deadline={deadline} className="font-semibold text-foreground" />
    </span>
  );
}