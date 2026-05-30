import { ImageResponse } from 'next/og';

// Cache aggressively — icon never changes for a given deploy.
export const runtime = 'edge';
export const dynamic = 'force-static';

const SIZE = 192;

/**
 * 192×192 PWA icon. Wordmark "RI" on AISB-green background. Generated at
 * build time via next/og — no PNG bytes committed to the repo (regenerable
 * from source by tweaking this file).
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
          fontSize: 96,
          fontWeight: 900,
          letterSpacing: -4,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        RI
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
