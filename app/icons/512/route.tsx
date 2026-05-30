import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const dynamic = 'force-static';

const SIZE = 512;

/**
 * 512×512 PWA icon. Required by Chrome's installability check; also used
 * for the Android home-screen + splash-screen render. Same wordmark as the
 * 192 variant, scaled.
 */
export async function GET(): Promise<Response> {
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
          fontSize: 256,
          fontWeight: 900,
          letterSpacing: -10,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        RI
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
