// Firestore listeners terminate permanently after an error (e.g. a transient permission-denied
// while a just-created caregiver relation propagates). This wrapper resubscribes with bounded
// backoff and reports the error only once retries are exhausted.

export type Unsubscribe = () => void;

export const RESUBSCRIBE_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 20_000];

export function resilientSubscription(
  subscribe: (onError: (e: Error) => void, onData: () => void) => Unsubscribe,
  onFinalError: (e: Error) => void,
  backoff: number[] = RESUBSCRIBE_BACKOFF_MS,
): Unsubscribe {
  let unsub: Unsubscribe | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let stopped = false;

  const start = () => {
    if (stopped) return;
    unsub = subscribe(
      (e) => {
        unsub = null;
        if (stopped) return;
        if (attempt < backoff.length) {
          timer = setTimeout(start, backoff[attempt++]);
        } else {
          onFinalError(e);
        }
      },
      () => {
        attempt = 0;
      },
    );
  };

  start();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unsub?.();
  };
}
