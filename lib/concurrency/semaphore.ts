/**
 * Pure async semaphore. FIFO. No deps.
 *
 * Used by `extractionSemaphore` to cap simultaneous Gemini extractions —
 * 4 parallel runExtractJobs each holding ~MB of image bytes + Gemini
 * request state OOM'd the Render free tier (512 MB) on the bulk +
 * folder-watcher flow. Hotfix 2026-05-30.
 *
 * Usage:
 *   const release = await semaphore.acquire();
 *   try { await work(); } finally { release(); }
 */
export interface Semaphore {
  /**
   * Acquire a permit, blocking until one is available. Returns a release
   * function — the caller MUST invoke it (use try/finally). Calling
   * release twice is a no-op so accidental double-release is safe.
   */
  acquire(): Promise<() => void>;
  /** Inspector — currently checked-out permits. Test/observability. */
  inFlight(): number;
  /** Inspector — number of acquire() calls waiting in the queue. */
  queued(): number;
  /** Inspector — the cap this semaphore was constructed with. */
  capacity(): number;
}

export function makeSemaphore(maxConcurrent: number): Semaphore {
  if (!Number.isFinite(maxConcurrent) || maxConcurrent < 1) {
    throw new Error(
      `Semaphore capacity must be a positive integer, got ${maxConcurrent}`,
    );
  }

  let inFlightCount = 0;
  const waiters: Array<() => void> = [];

  function drainNext(): void {
    if (inFlightCount >= maxConcurrent) return;
    const next = waiters.shift();
    if (!next) return;
    inFlightCount++;
    next();
  }

  return {
    async acquire(): Promise<() => void> {
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        drainNext();
      });
      // We've been granted a permit — `inFlightCount` was incremented in
      // drainNext() before our resolve fired.
      let released = false;
      return () => {
        if (released) return; // idempotent
        released = true;
        inFlightCount--;
        drainNext();
      };
    },
    inFlight: () => inFlightCount,
    queued: () => waiters.length,
    capacity: () => maxConcurrent,
  };
}
