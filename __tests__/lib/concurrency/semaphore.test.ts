import { describe, expect, it } from 'vitest';

import { makeSemaphore } from '@/lib/concurrency/semaphore';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('makeSemaphore', () => {
  it('rejects invalid capacity', () => {
    expect(() => makeSemaphore(0)).toThrow();
    expect(() => makeSemaphore(-1)).toThrow();
    expect(() => makeSemaphore(Number.NaN)).toThrow();
  });

  it('reports the capacity it was constructed with', () => {
    expect(makeSemaphore(3).capacity()).toBe(3);
  });

  it('grants permits up to capacity without blocking', async () => {
    const sem = makeSemaphore(2);
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    expect(sem.inFlight()).toBe(2);
    expect(sem.queued()).toBe(0);
    r1();
    r2();
    expect(sem.inFlight()).toBe(0);
  });

  // The bug this hotfix prevents: 4 parallel extractions → OOM.
  // Cap = 2 means at most 2 should ever be running, even when 5 are
  // queued simultaneously.
  it('caps simultaneous holders at the configured capacity (the OOM-prevention contract)', async () => {
    const sem = makeSemaphore(2);
    let inFlight = 0;
    let maxInFlight = 0;
    let completed = 0;

    const work = async () => {
      const release = await sem.acquire();
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Simulate Gemini latency
      await sleep(5);
      inFlight--;
      completed++;
      release();
    };

    // Kick off 5 simultaneous workers.
    await Promise.all(Array.from({ length: 5 }, () => work()));

    expect(maxInFlight).toBe(2);
    expect(completed).toBe(5);
    expect(sem.inFlight()).toBe(0);
    expect(sem.queued()).toBe(0);
  });

  it('drains in FIFO order', async () => {
    const sem = makeSemaphore(1);
    const order: number[] = [];

    const run = async (id: number) => {
      const release = await sem.acquire();
      order.push(id);
      await sleep(1);
      release();
    };

    // All 5 enqueue while the first holder runs.
    await Promise.all([run(1), run(2), run(3), run(4), run(5)]);

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('release is idempotent — double-call does not corrupt the count', async () => {
    const sem = makeSemaphore(1);
    const release = await sem.acquire();
    expect(sem.inFlight()).toBe(1);
    release();
    release(); // No-op
    expect(sem.inFlight()).toBe(0);
    // Subsequent acquires still work normally.
    const release2 = await sem.acquire();
    expect(sem.inFlight()).toBe(1);
    release2();
  });

  it('queued() reflects pending acquires', async () => {
    const sem = makeSemaphore(1);
    const release = await sem.acquire();
    // Don't await — fire 3 acquires; they'll all queue.
    sem.acquire();
    sem.acquire();
    sem.acquire();
    // Let the microtasks settle.
    await sleep(0);
    expect(sem.queued()).toBe(3);
    expect(sem.inFlight()).toBe(1);
    release();
  });
});
