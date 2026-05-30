'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker on first client render. Mounted from
 * `app/layout.tsx`.
 *
 * Production-only by default — running the SW in dev would intercept
 * Vite/Next HMR requests and is more confusing than useful. Override by
 * setting `NEXT_PUBLIC_ENABLE_SW=true` if you need to test SW behavior in
 * dev.
 *
 * No render output; just a side-effect mount.
 */
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const enableInDev = process.env.NEXT_PUBLIC_ENABLE_SW === 'true';
    if (process.env.NODE_ENV !== 'production' && !enableInDev) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // SW registration failure is not fatal — the app works fine without
        // the SW, just no install prompt and no offline asset caching.
        console.warn('[pwa] service worker registration failed:', err);
      });
  }, []);

  return null;
}
