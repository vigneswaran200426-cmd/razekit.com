import AlertState from '@/components/alerts/AlertState';

/*
  EmptyState is now a thin facade over the unified Razekit Alert & State System.
  Same props API as before — every existing call site renders the new animated system.
*/
export default function EmptyState({ icon: _ignoredIcon, title, message, description, visual, actionLabel, to, onAction, compact = false, className }) {
  return (
    <AlertState
      type="empty"
      title={title}
      description={description ?? message}
      shape={visual}
      compact={compact}
      action={actionLabel ? { label: actionLabel, to, onClick: onAction } : undefined}
      className={className}
    />
  );
}