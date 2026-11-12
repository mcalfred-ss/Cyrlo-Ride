import { ErrorBanner } from './ui';

export function LoadError({
  message,
  httpStatus,
  onRetry,
  testId,
}: {
  message: string;
  httpStatus?: number;
  onRetry?: () => void;
  testId: string;
}) {
  const text =
    httpStatus === 403 && !/MFA/i.test(message) ? `Permission denied: ${message}` : message;
  return (
    <div data-testid={testId}>
      <ErrorBanner message={text} onRetry={onRetry} />
    </div>
  );
}
