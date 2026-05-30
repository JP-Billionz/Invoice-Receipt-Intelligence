import { makeSemaphore, type Semaphore } from './semaphore';

/**
 * Process-wide semaphore that caps concurrent `runExtractJob` invocations.
 *
 * Why: each in-flight extraction holds ~MB of image bytes + Gemini SDK
 * request state. Without a cap, a bulk/folder-watcher run with N files
 * fires N parallel jobs and OOMs the Render free tier (512 MB). Hotfix
 * 2026-05-30.
 *
 * Tunable at runtime via `EXTRACTION_CONCURRENCY` (default 2). 2 is the
 * sweet spot for the free tier — empirically each in-flight extraction
 * peaks around 80–120 MB; two simultaneous fits comfortably under the
 * 512 MB limit alongside Next + Prisma.
 *
 * Lives at module scope on purpose: every `runExtractJob` call across the
 * process must consult the SAME semaphore. Re-initializing per request
 * would defeat the whole point.
 */
function parseConcurrency(): number {
  const raw = process.env.EXTRACTION_CONCURRENCY;
  const n = Number(raw ?? '2');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

export const extractionSemaphore: Semaphore = makeSemaphore(parseConcurrency());
