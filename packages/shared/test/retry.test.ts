import { describe, expect, it } from 'vitest';
import { retryAsync } from '../src/index.js';

describe('retryAsync', () => {
  it('returns the first success without waiting', async () => {
    const waits: number[] = [];
    const result = await retryAsync(async () => 'done', {
      shouldRetry: () => true,
      delayMs: () => 100,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    expect(result).toBe('done');
    expect(waits).toEqual([]);
  });

  it('waits the requested delays and retries until it succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;

    const result = await retryAsync(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('busy');
        return 'restored';
      },
      {
        attempts: 4,
        shouldRetry: () => true,
        delayMs: (_error, attempt) => (attempt + 1) * 100,
        wait: async (milliseconds) => {
          waits.push(milliseconds);
        },
      },
    );

    expect(result).toBe('restored');
    expect(calls).toBe(3);
    expect(waits).toEqual([100, 200]);
  });

  it('rethrows the last error when the attempts run out', async () => {
    let calls = 0;

    await expect(
      retryAsync(
        async () => {
          calls += 1;
          throw new Error(`fail ${calls}`);
        },
        {
          attempts: 3,
          shouldRetry: () => true,
          delayMs: () => 0,
          wait: async () => {},
        },
      ),
    ).rejects.toThrow('fail 3');

    expect(calls).toBe(3);
  });

  it('does not retry when the caller says the error is permanent', async () => {
    let calls = 0;

    await expect(
      retryAsync(
        async () => {
          calls += 1;
          throw new Error('validation');
        },
        {
          attempts: 5,
          shouldRetry: () => false,
          delayMs: () => 0,
          wait: async () => {},
        },
      ),
    ).rejects.toThrow('validation');

    expect(calls).toBe(1);
  });

  it('treats a single attempt as no retries', async () => {
    let calls = 0;

    await expect(
      retryAsync(
        async () => {
          calls += 1;
          throw new Error('once');
        },
        {
          attempts: 1,
          shouldRetry: () => true,
          delayMs: () => 0,
          wait: async () => {},
        },
      ),
    ).rejects.toThrow('once');

    expect(calls).toBe(1);
  });
});
