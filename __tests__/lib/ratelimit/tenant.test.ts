import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetRateLimitForTests,
  checkGeminiRateLimit,
} from '@/lib/ratelimit/tenant';

const REAL_ENV = { ...process.env };

beforeEach(() => {
  __resetRateLimitForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...REAL_ENV };
});

describe('checkGeminiRateLimit', () => {
  it('allows the first request and returns remaining tokens', () => {
    process.env.GEMINI_RATE_LIMIT_BURST = '5';
    process.env.GEMINI_RATE_LIMIT_PER_MINUTE = '60';

    const decision = checkGeminiRateLimit('tenant-a');
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(4);
    expect(decision.retryAfterMs).toBe(0);
  });

  it('drains the burst then 429s', () => {
    process.env.GEMINI_RATE_LIMIT_BURST = '3';
    process.env.GEMINI_RATE_LIMIT_PER_MINUTE = '60';

    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);

    const denied = checkGeminiRateLimit('tenant-a');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.remaining).toBe(0);
  });

  it('refills tokens over time', () => {
    process.env.GEMINI_RATE_LIMIT_BURST = '1';
    process.env.GEMINI_RATE_LIMIT_PER_MINUTE = '60'; // 1 token per second

    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(false);

    // Advance 1.5 seconds — refill rate is 1/sec, so we should have 1 token back.
    vi.advanceTimersByTime(1500);

    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
  });

  it('isolates buckets per tenant — one tenant cannot exhaust another', () => {
    process.env.GEMINI_RATE_LIMIT_BURST = '2';
    process.env.GEMINI_RATE_LIMIT_PER_MINUTE = '60';

    // Tenant A drains its bucket
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(false);

    // Tenant B is unaffected — kickoff hardline: "one tenant must not exhaust
    // the shared key for everyone"
    expect(checkGeminiRateLimit('tenant-b').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-b').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-b').allowed).toBe(false);
  });

  it("caps refill at the burst — tokens don't accumulate beyond the cap", () => {
    process.env.GEMINI_RATE_LIMIT_BURST = '3';
    process.env.GEMINI_RATE_LIMIT_PER_MINUTE = '60';

    // Use 1, advance a LOT of time, then verify max 3 again (not 30+).
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true); // 2 left
    vi.advanceTimersByTime(60_000); // 60 tokens would accrue without cap

    // Should be 3 - 1 = 2 again after this single call
    expect(checkGeminiRateLimit('tenant-a').remaining).toBe(2);

    // Drain to confirm the cap held — should be able to take 2 more, no more
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(false);
  });

  it('returns retry-after that actually unblocks the caller', () => {
    process.env.GEMINI_RATE_LIMIT_BURST = '1';
    process.env.GEMINI_RATE_LIMIT_PER_MINUTE = '60';

    checkGeminiRateLimit('tenant-a'); // drain
    const denied = checkGeminiRateLimit('tenant-a');
    expect(denied.allowed).toBe(false);

    vi.advanceTimersByTime(denied.retryAfterMs);
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
  });

  it('uses sane defaults when env vars are missing or invalid', () => {
    delete process.env.GEMINI_RATE_LIMIT_BURST;
    delete process.env.GEMINI_RATE_LIMIT_PER_MINUTE;

    // Default burst = 10, so 10 calls allowed then deny
    for (let i = 0; i < 10; i++) {
      expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
    }
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(false);
  });

  it('ignores invalid env values and falls back to defaults', () => {
    process.env.GEMINI_RATE_LIMIT_BURST = 'not-a-number';
    process.env.GEMINI_RATE_LIMIT_PER_MINUTE = '-5';

    // Should still allow 10 (default burst), not crash
    expect(checkGeminiRateLimit('tenant-a').allowed).toBe(true);
  });
});
