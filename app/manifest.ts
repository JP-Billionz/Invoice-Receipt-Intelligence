import type { MetadataRoute } from 'next';

/**
 * PWA web manifest — Next 14 metadata route.
 *
 * Served at `/manifest.webmanifest` and auto-injected as
 * `<link rel="manifest">` into every page's `<head>`. Per Plan §2.4 + §4.9:
 * AISB brand colors, start_url at the working surface, three icons at the
 * sizes Chrome's installability check requires.
 *
 * The matching `<meta name="theme-color">` is set in `app/layout.tsx`
 * (viewport.themeColor) so the browser chrome matches the manifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Receipt Intelligence AI',
    short_name: 'Receipts AI',
    description:
      'Scan receipts into balanced IFRS/GAAP journal entries with Barbados-local price comparisons.',
    start_url: '/scan',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // AISB brand — memory `reference-aisb-brand`, Plan §4.9.
    theme_color: '#9BD850', // aisb-green
    background_color: '#0A0716', // aisb-bg (splash)
    categories: ['business', 'finance', 'productivity'],
    icons: [
      {
        src: '/icons/192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
