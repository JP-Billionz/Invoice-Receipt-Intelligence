import { ImageResponse } from 'next/og';

/**
 * Favicon (small icon for the browser tab). Next 14 auto-injects as
 * `<link rel="icon">`. Separate from the PWA manifest icons (those are
 * under `/icons/*` via route handlers).
 */
export const runtime = 'edge';
export const dynamic = 'force-static';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 18,
          fontWeight: 900,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        RI
      </div>
    ),
    { ...size },
  );
}
