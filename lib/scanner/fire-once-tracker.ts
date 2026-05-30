/**
 * Fire-once-per-key tracker.
 *
 * Used by `ScannerClient` to make the auto-fire-comparison effect immune to
 * React effect-replay caused by reference churn: even if the effect runs
 * 10× per second because `selectedItem` is a fresh `useMemo` reference on
 * every poll tick, `tryFire(scanId)` returns `true` exactly once per scanId.
 *
 * The bug class this prevents: a useEffect that depends on a polled object
 * + fires a side-effect (export download, comparison call). Without a
 * cross-render tracker, the side-effect fires on every tick because the
 * intermediate state-update guard (`if (someState !== 'idle') return`)
 * can race with the next poll's render before the state-update commits.
 *
 * Pure / synchronous — wrap with `useRef(makeFireOnceTracker())` in React.
 */
export interface FireOnceTracker {
  /** Returns true the FIRST time called with this key; false thereafter. */
  tryFire(key: string): boolean;
  /** Manually mark a key as fired without invoking the side-effect. */
  markFired(key: string): void;
  /** Drop all tracked keys. */
  reset(): void;
  /** Inspector: has this key been fired? */
  hasFired(key: string): boolean;
}

export function makeFireOnceTracker(): FireOnceTracker {
  const fired = new Set<string>();
  return {
    tryFire(key) {
      if (fired.has(key)) return false;
      fired.add(key);
      return true;
    },
    markFired(key) {
      fired.add(key);
    },
    reset() {
      fired.clear();
    },
    hasFired(key) {
      return fired.has(key);
    },
  };
}
