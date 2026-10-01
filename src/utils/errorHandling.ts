/**
 * Utility for formatting crash reports, error boundaries, and unhandled exceptions.
 */

export interface FormattedCrashReport {
  timestamp: string;
  errorName: string;
  errorMessage: string;
  stack?: string;
  componentStack?: string;
  rawReport: string;
}

export function formatCrashReport(
  error: Error | null | undefined,
  componentStack?: string | null
): FormattedCrashReport {
  const timestamp = new Date().toISOString();
  const errorName = error?.name || 'Error';
  const errorMessage = error?.message || 'Unknown error occurred';
  const stack = error?.stack || 'No stack trace available';
  const compStack = componentStack || 'No component stack available';

  const rawReport = [
    `MOBPOS Crash Report`,
    `Time: ${timestamp}`,
    `Error: ${errorName}: ${errorMessage}`,
    `Stack: ${stack}`,
    `Component Stack: ${compStack}`
  ].join('\n\n');

  return {
    timestamp,
    errorName,
    errorMessage,
    stack,
    componentStack: compStack,
    rawReport
  };
}

export function isRecoverableError(error: unknown): boolean {
  if (!error) return true;
  if (error instanceof Error) {
    // Fatal out of memory or syntax errors might not be recoverable
    if (error.name === 'RangeError' && error.message.includes('Maximum call stack size exceeded')) {
      return false;
    }
  }
  return true;
}
