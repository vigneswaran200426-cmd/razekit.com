import AlertState from '@/components/alerts/AlertState';

// SuccessState is a facade over the unified Alert & State System — calm upward drift, one action.
export default function SuccessState({ title, message, actionLabel, to, onAction, className }) {
  return (
    <AlertState
      type="success"
      title={title}
      description={message}
      action={actionLabel ? { label: actionLabel, to, onClick: onAction } : undefined}
      className={className}
    />
  );
}