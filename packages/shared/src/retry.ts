/**
 * Retry an async task with a caller-supplied decision and delay. Used for
 * backup upload parts: sending a part again is safe because restore merges, so
 * a rate-limit window delays a large restore instead of failing it.
 *
 * The wait is injectable so a test can assert the delays without sleeping.
 */

export interface RetryOptions {
  /** Total attempts, including the first. Defaults to 5. */
  attempts?: number;
  shouldRetry: (error: unknown, attempt: number) => boolean;
  /** Delay before the next attempt, in milliseconds. */
  delayMs: (error: unknown, attempt: number) => number;
  wait?: (milliseconds: number) => Promise<void>;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function retryAsync<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 5);
  const wait = options.wait ?? sleep;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const canRetry = attempt < attempts && options.shouldRetry(error, attempt - 1);
      if (!canRetry) throw error;
      await wait(options.delayMs(error, attempt - 1));
    }
  }
}
