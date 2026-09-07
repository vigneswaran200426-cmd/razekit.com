import AlertState from '@/components/alerts/AlertState';

// ErrorState is a facade over the unified Alert & State System — calm, one sentence, one retry.
export default function ErrorState({ title = 'Something went wrong', message, onRetry, retryLabel = 'Try again', className }) {
  return (
    <AlertState
      type="error"
      title={title}
      description={message}
      action={onRetry ? { label: retryLabel, onClick: onRetry } : undefined}
      className={className}
    />
  );
}