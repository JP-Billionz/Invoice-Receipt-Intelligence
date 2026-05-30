import { describe, expect, it } from 'vitest';

import manifest from '@/app/manifest';

/**
 * Contract test for the PWA manifest. Asserts the fields Chrome's
 * installability check + iOS home-screen flow + Lighthouse PWA audit all
 * read. Bumping any of these values is a real product decision — the test
 * forces it to surface in code review rather than slip silently.
 */
describe('PWA manifest', () => {
  const m = manifest();

  it('uses AISB brand colors per Plan §4.9', () => {
    expect(m.theme_color).toBe('#9BD850'); // aisb-green
    expect(m.background_color).toBe('#0A0716'); // aisb-bg
  });

  it('has the canonical name + short_name', () => {
    expect(m.name).toBe('Receipt Intelligence AI');
    expect(m.short_name).toBe('Receipts AI');
  });

  it('lands the user on the working surface', () => {
    expect(m.start_url).toBe('/scan');
    expect(m.scope).toBe('/');
  });

  it('declares standalone display mode (PWA install + chromeless launch)', () => {
    expect(m.display).toBe('standalone');
  });

  it('ships the three icons Chrome installability + Lighthouse require', () => {
    const icons = m.icons ?? [];
    expect(icons).toHaveLength(3);

    const i192 = icons.find((i) => i.sizes === '192x192');
    const i512 = icons.find(
      (i) => i.sizes === '512x512' && i.purpose !== 'maskable',
    );
    const maskable = icons.find((i) => i.purpose === 'maskable');

    expect(i192, 'must have a 192x192 icon').toBeDefined();
    expect(i512, 'must have a 512x512 any-purpose icon').toBeDefined();
    expect(maskable, 'must have a maskable icon for Android launchers').toBeDefined();

    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
      expect(icon.src.startsWith('/')).toBe(true);
    }
  });

  it('description is present (Lighthouse PWA audit reads this)', () => {
    expect(typeof m.description).toBe('string');
    expect(m.description!.length).toBeGreaterThan(20);
  });
});
