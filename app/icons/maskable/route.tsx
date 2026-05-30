import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const dynamic = 'force-static';

const SIZE = 512;

/**
 * 512×512 MASKABLE PWA icon.
 *
 * Maskable icons must survive being cropped to a circle, squircle, rounded
 * square, etc. by various Android launchers. The W3C-recommended "safe
 * zone" is the central 80% — anything outside is liable to be cropped.
 *
 * So this variant: AISB-green fills the WHOLE canvas (full-bleed
 * background — never gets cropped because it's edge-to-edge), and the
 * wordmark is rendered smaller + centered so it sits well inside the
 * safe zone regardless of the launcher's mask shape.
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
        }}
      >
        {/* Inner square sits inside the safe zone (80% of canvas). */}
        <div
          style={{
            width: '60%',
            height: '60%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0A0716',
            fontSize: 200,
            fontWeight: 900,
            letterSpacing: -8,
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          RI
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
