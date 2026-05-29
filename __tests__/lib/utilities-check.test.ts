import { describe, expect, it } from 'vitest';

import { isUtilityLineItem } from '@/lib/utilities-check';

describe('isUtilityLineItem', () => {
  describe('matches utility line items (price comparison MUST be skipped)', () => {
    const utilityCases = [
      'Electricity bill',
      'electric usage',
      'BL&P statement',
      'Barbados Light & Power',
      'kWh consumption',
      'Energy charge',
      'Power usage',
      'Water bill',
      'WATER SERVICE charge',
      'BWA monthly',
      'Barbados Water Authority',
      'Sewerage',
      'Utility bill',
    ];

    utilityCases.forEach((desc) => {
      it(`flags "${desc}"`, () => {
        expect(isUtilityLineItem(desc)).toBe(true);
      });
    });
  });

  describe('does NOT flag non-utility items (price comparison should run)', () => {
    const nonUtilityCases = [
      'Electric kettle',
      'Watercolor paints',
      'Office paper',
      'Coffee beans',
      'Power drill',
      'Bottled water (4-pack)',
      'Energy drink',
      'Light bulb',
      '',
      'Receipt total',
      'Plumbing repair',
    ];

    nonUtilityCases.forEach((desc) => {
      it(`leaves "${desc}" alone`, () => {
        expect(isUtilityLineItem(desc)).toBe(false);
      });
    });
  });
});
