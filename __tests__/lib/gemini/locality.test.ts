import { describe, expect, it } from 'vitest';

import {
  checkBarbadosLocality,
  parseAllowlist,
} from '@/lib/gemini/locality';

describe('parseAllowlist', () => {
  it('returns empty array for nullish / empty input', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist(null)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist('  ')).toEqual([]);
  });

  it('splits comma-separated, trims, lowercases, dedupes', () => {
    expect(
      parseAllowlist('PriceSmart.com, MASSYStoresBB.com  ,pricesmart.com'),
    ).toEqual(['pricesmart.com', 'massystoresbb.com']);
  });

  it('drops empty entries from trailing/double commas', () => {
    expect(parseAllowlist(',,a.com,,,b.com,')).toEqual(['a.com', 'b.com']);
  });
});

describe('checkBarbadosLocality', () => {
  const allowlist = ['pricesmart.com', 'massystoresbb.com'];

  it('accepts .bb TLD as Barbados-local regardless of allowlist', () => {
    expect(checkBarbadosLocality('https://carltonbarbados.bb/product/123', [])).toMatchObject({
      isLocal: true,
      reason: 'bb-tld',
    });
  });

  it('accepts allowlisted bare domain', () => {
    expect(checkBarbadosLocality('https://pricesmart.com/path', allowlist)).toMatchObject({
      isLocal: true,
      reason: 'allowlist',
    });
  });

  it('accepts subdomains of allowlisted domains', () => {
    expect(checkBarbadosLocality('https://bb.pricesmart.com/path', allowlist)).toMatchObject({
      isLocal: true,
      reason: 'allowlist',
    });
    expect(checkBarbadosLocality('https://www.massystoresbb.com/x', allowlist)).toMatchObject({
      isLocal: true,
      reason: 'allowlist',
    });
  });

  it('rejects non-BB, non-allowlisted domains — kickoff hardline', () => {
    expect(checkBarbadosLocality('https://amazon.com/product', allowlist)).toMatchObject({
      isLocal: false,
      reason: 'not-barbados',
    });
    expect(checkBarbadosLocality('https://walmart.com/x', allowlist)).toMatchObject({
      isLocal: false,
      reason: 'not-barbados',
    });
    expect(checkBarbadosLocality('https://amazon.co.uk/x', allowlist)).toMatchObject({
      isLocal: false,
      reason: 'not-barbados',
    });
  });

  it('rejects substring matches that are NOT subdomain matches', () => {
    // "fakeamazon.com" looks-like ".com" but is not a subdomain of "amazon.com"
    expect(checkBarbadosLocality('https://fakepricesmart.com/x', allowlist)).toMatchObject({
      isLocal: false,
    });
    // ".com.bb" trick — actually this IS legitimately .bb, accept it.
    expect(checkBarbadosLocality('https://retailer.com.bb/x', allowlist)).toMatchObject({
      isLocal: true,
      reason: 'bb-tld',
    });
  });

  it('rejects malformed URLs', () => {
    expect(checkBarbadosLocality('not a url', allowlist)).toMatchObject({
      isLocal: false,
      hostname: null,
      reason: 'invalid-url',
    });
  });

  it('case-insensitive on hostname', () => {
    expect(checkBarbadosLocality('https://PriceSmart.COM/x', allowlist)).toMatchObject({
      isLocal: true,
    });
  });
});
