/**
 * Per-tenant Gemini rate limit.
 *
 * Per Plan §5.3 (Cowork addition). Token bucket per `tenantId`, checked at
 * the entry of every route that calls Gemini (POST /api/scan, POST
 * /api/scan/[scanId]/comparison). One tenant exhausting its bucket returns
 * HTTP 429 with `Retry-After`; other tenants are unaffected.
 *
 * In-memory state. Doesn't persist across instance restarts, which is fine
 * for the free tier's single instance. When we scale to multi-instance,
 * swap this for a Redis-backed adapter behind the same interface.
 *
 * The bucket models: BURST tokens replenished at RATE tokens per minute. A
 * tenant can spike up to BURST requests in a short window, then settles to
 * RATE/min sustained.
 *
 * Tunable at runtime via env (set in render.yaml):
 *   GEMINI_RATE_LIMIT_PER_MINUTE  default 60
 *   GEMINI_RATE_LIMIT_BURST       default 10
 */

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Milliseconds the caller should wait before retrying, if `allowed === false`. */
  retryAfterMs: number;
}

interface BucketState {
  /** Tokens currently available. */
  tokens: number;
  /** Epoch ms of the last refill. */
  lastRefillMs: number;
}

const buckets = new Map<string, BucketState>();

function config(): { ratePerMinute: number; burst: number } {
  const ratePerMinute = Number(process.env.GEMINI_RATE_LIMIT_PER_MINUTE ?? '60');
  const burst = Number(process.env.GEMINI_RATE_LIMIT_BURST ?? '10');
  return {
    ratePerMinute: Number.isFinite(ratePerMinute) && ratePerMinute > 0 ? ratePerMinute : 60,
    burst: Number.isFinite(burst) && burst > 0 ? burst : 10,
  };
}

export function checkGeminiRateLimit(tenantId: string): RateLimitDecision {
  const { ratePerMinute, burst } = config();
  const tokensPerMs = ratePerMinute / 60_000;
  const now = Date.now();

  let bucket = buckets.get(tenantId);
  if (!bucket) {
    bucket = { tokens: burst, lastRefillMs: now };
    buckets.set(tenantId, bucket);
  } else {
    const elapsedMs = now - bucket.lastRefillMs;
    if (elapsedMs > 0) {
      bucket.tokens = Math.min(burst, bucket.tokens + elapsedMs * tokensPerMs);
      bucket.lastRefillMs = now;
    }
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: 0,
    };
  }

  // Time until 1 token accrues = (1 - bucket.tokens) / tokensPerMs
  const retryAfterMs = Math.ceil((1 - bucket.tokens) / tokensPerMs);
  return {
    allowed: false,
    remaining: 0,
    retryAfterMs,
  };
}

/** Test-only — drop all buckets between test runs. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
