import { useEffect } from 'react';

/**
 * Triggers `dismiss()` after `ms` milliseconds whenever the outcome
 * lands in the success state. Errors are deliberately NOT auto-dismissed
 * (decision D1) — the user must acknowledge them consciously.
 *
 * The hook re-arms the timer on every change of the outcome reference,
 * so if the consumer triggers a new flow before the previous success
 * has timed out, the old timer is cleared and a fresh one starts.
 */
export const useAutoDismissSuccess = <T extends { readonly status: string }>(
  outcome: T,
  dismiss: () => void,
  ms = 5000,
): void => {
  useEffect(() => {
    if (outcome.status !== 'success') return;
    const id = setTimeout(dismiss, ms);
    return () => clearTimeout(id);
  }, [outcome, dismiss, ms]);
};
