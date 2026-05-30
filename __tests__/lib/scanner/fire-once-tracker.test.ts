import { describe, expect, it } from 'vitest';

import { makeFireOnceTracker } from '@/lib/scanner/fire-once-tracker';

describe('makeFireOnceTracker', () => {
  it('returns true on first tryFire, false thereafter — the runaway-export prevention contract', () => {
    const tracker = makeFireOnceTracker();
    expect(tracker.tryFire('scan-1')).toBe(true);
    for (let i = 0; i < 9; i++) {
      expect(tracker.tryFire('scan-1')).toBe(false);
    }
  });

  it('isolates keys — fire-once is per-key', () => {
    const tracker = makeFireOnceTracker();
    expect(tracker.tryFire('scan-1')).toBe(true);
    expect(tracker.tryFire('scan-2')).toBe(true);
    expect(tracker.tryFire('scan-1')).toBe(false);
    expect(tracker.tryFire('scan-2')).toBe(false);
    expect(tracker.tryFire('scan-3')).toBe(true);
  });

  it('hasFired reports state without firing', () => {
    const tracker = makeFireOnceTracker();
    expect(tracker.hasFired('x')).toBe(false);
    tracker.tryFire('x');
    expect(tracker.hasFired('x')).toBe(true);
  });

  it('markFired pre-arms a key without invoking', () => {
    const tracker = makeFireOnceTracker();
    tracker.markFired('x');
    expect(tracker.tryFire('x')).toBe(false);
  });

  it('reset() lets keys fire again', () => {
    const tracker = makeFireOnceTracker();
    tracker.tryFire('x');
    expect(tracker.tryFire('x')).toBe(false);
    tracker.reset();
    expect(tracker.tryFire('x')).toBe(true);
  });

  it('counts: across 100 tryFire calls on the same key, exactly 1 returns true', () => {
    const tracker = makeFireOnceTracker();
    let trues = 0;
    for (let i = 0; i < 100; i++) {
      if (tracker.tryFire('hot-key')) trues++;
    }
    expect(trues).toBe(1);
  });
});
