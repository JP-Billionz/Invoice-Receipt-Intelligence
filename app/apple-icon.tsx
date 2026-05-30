import { ImageResponse } from 'next/og';

/**
 * Apple touch icon — used when a user adds the site to their iOS home
 * screen. iOS doesn't read the PWA manifest's `icons[]`; it reads the
 * `<link rel="apple-touch-icon">` tag, which Next 14 auto-injects when
 * this file exists.
 *
 * 180×180 is the canonical Apple size. Apple ROUNDS the icon for the
 * home-screen tile but does NOT crop, so a full-bleed bg + centered
 * wordmark works fine without a maskable variant.
 */
export const runtime = 'edge';
export const dynamic = 'force-static';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#9BD850',
          color: '#0A0716',
          fontSize: 90,
          fontWeight: 900,
          letterSpacing: -4,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        RI
      </div>
    ),
    { ...size },
  );
}
