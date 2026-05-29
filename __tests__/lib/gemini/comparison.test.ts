import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock function so both the vi.mock factory below AND the tests
// share the same instance.
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  // Use a class so `new GoogleGenAI(...)` works under Vitest 4 (arrow-function
  // implementations aren't constructable).
  GoogleGenAI: class {
    public models = { generateContent: mockGenerateContent };
    constructor(_opts: { apiKey: string }) {}
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
  },
}));

// Dynamic import AFTER vi.mock so the module under test picks up the mock.
const { runComparison } = await import('@/lib/gemini/comparison');

beforeAll(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

beforeEach(() => {
  mockGenerateContent.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function geminiResponse(opts: {
  jsonItems: unknown[] | string;
  groundingUris?: { uri: string; title: string }[];
}) {
  return {
    text:
      typeof opts.jsonItems === 'string'
        ? opts.jsonItems
        : JSON.stringify(opts.jsonItems),
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: (opts.groundingUris ?? []).map((g) => ({
            web: { uri: g.uri, title: g.title },
          })),
        },
      },
    ],
  };
}

const ALLOWLIST = 'pricesmart.com,massystoresbb.com';

describe('runComparison — kickoff hardline guardrails', () => {
  // ==========================================================================
  // REQUIRED — kickoff §6: "no source → blank, never invented"
  // ==========================================================================
  describe('REQUIRED: no Barbados source returned → blank, never hallucinated', () => {
    it('returns no-source skip for EVERY input item when groundingChunks is empty', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({ jsonItems: [], groundingUris: [] }),
      );

      const result = await runComparison({
        lineItems: [
          { id: 'li-1', description: 'Office paper ream', total: 25 },
          { id: 'li-2', description: 'Toner cartridge', total: 120 },
        ],
        allowlist: ALLOWLIST,
      });

      expect(result.size).toBe(2);
      for (const li of ['li-1', 'li-2']) {
        const r = result.get(li);
        expect(r?.kind).toBe('skipped');
        if (r?.kind === 'skipped') {
          expect(r.reason).toBe('no-source');
        }
        // CRITICAL: no `kind: 'found'` is ever emitted in this path.
        expect(r?.kind).not.toBe('found');
      }
    });

    it('returns no-source even when the model FABRICATES prices+URLs without grounding', async () => {
      // Model returns a hallucinated comparison; groundingChunks is empty
      // (the search tool found nothing). The guardrail must drop the result.
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({
          jsonItems: [
            {
              itemIndex: 0,
              comparablePrice: 19.99,
              comparableProduct: 'Made-up paper',
              comparableVendor: 'Imaginary Store',
              sourceUrl: 'https://pricesmart.com/this-is-fake',
            },
          ],
          groundingUris: [], // model claims a URL but search tool didn't return it
        }),
      );

      const result = await runComparison({
        lineItems: [{ id: 'li-1', description: 'Office paper', total: 25 }],
        allowlist: ALLOWLIST,
      });

      const r = result.get('li-1');
      expect(r?.kind).toBe('skipped');
      if (r?.kind === 'skipped') expect(r.reason).toBe('no-source');
    });

    it('returns no-source when groundingChunks contains only NON-BB sources', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({
          jsonItems: [
            {
              itemIndex: 0,
              comparablePrice: 22,
              comparableProduct: 'Some product',
              comparableVendor: 'Amazon',
              sourceUrl: 'https://amazon.com/dp/B0XYZ',
            },
          ],
          groundingUris: [
            { uri: 'https://amazon.com/dp/B0XYZ', title: 'Amazon' },
          ],
        }),
      );

      const result = await runComparison({
        lineItems: [{ id: 'li-1', description: 'Office paper', total: 25 }],
        allowlist: ALLOWLIST,
      });

      const r = result.get('li-1');
      expect(r?.kind).toBe('skipped');
      if (r?.kind === 'skipped') expect(r.reason).toBe('no-source');
    });

    it('returns no-source when Gemini itself throws (fail-closed)', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('boom'));

      const result = await runComparison({
        lineItems: [{ id: 'li-1', description: 'Office paper', total: 25 }],
        allowlist: ALLOWLIST,
      });

      const r = result.get('li-1');
      expect(r?.kind).toBe('skipped');
      if (r?.kind === 'skipped') expect(r.reason).toBe('no-source');
    });
  });

  // ==========================================================================
  // Utilities bypass (kickoff §6)
  // ==========================================================================
  describe('Utilities exclusion — Gemini is never called', () => {
    it('skips electricity bill without invoking Gemini', async () => {
      const result = await runComparison({
        lineItems: [
          { id: 'li-1', description: 'Electricity bill — May', total: 450 },
        ],
        allowlist: ALLOWLIST,
      });

      expect(mockGenerateContent).not.toHaveBeenCalled();
      const r = result.get('li-1');
      expect(r?.kind).toBe('skipped');
      if (r?.kind === 'skipped') expect(r.reason).toBe('utility');
    });

    it('skips water bill / BWA without invoking Gemini', async () => {
      const result = await runComparison({
        lineItems: [
          { id: 'li-1', description: 'BWA water service charge', total: 80 },
        ],
        allowlist: ALLOWLIST,
      });

      expect(mockGenerateContent).not.toHaveBeenCalled();
      const r = result.get('li-1');
      expect(r?.kind).toBe('skipped');
      if (r?.kind === 'skipped') expect(r.reason).toBe('utility');
    });

    it('mixed input: utilities skipped without Gemini seeing them, others go to Gemini', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({ jsonItems: [], groundingUris: [] }),
      );

      await runComparison({
        lineItems: [
          { id: 'li-util', description: 'Electricity bill', total: 200 },
          { id: 'li-paper', description: 'Office paper ream', total: 25 },
        ],
        allowlist: ALLOWLIST,
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const call = mockGenerateContent.mock.calls[0][0];
      const promptText = call.contents.parts.find(
        (p: any) => 'text' in p,
      ).text;
      expect(promptText).toContain('Office paper ream');
      expect(promptText).not.toContain('Electricity bill');
    });

    it('all-utilities input does not call Gemini at all', async () => {
      const result = await runComparison({
        lineItems: [
          { id: 'li-1', description: 'Electricity bill', total: 200 },
          { id: 'li-2', description: 'Water bill', total: 80 },
        ],
        allowlist: ALLOWLIST,
      });

      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(result.size).toBe(2);
      for (const li of ['li-1', 'li-2']) {
        const r = result.get(li);
        expect(r?.kind).toBe('skipped');
        if (r?.kind === 'skipped') expect(r.reason).toBe('utility');
      }
    });
  });

  // ==========================================================================
  // Found path — every condition must hold
  // ==========================================================================
  describe('Found path — accepts ONLY valid Barbados-local sources from grounding', () => {
    it('accepts a .bb-TLD source that appears in groundingChunks', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({
          jsonItems: [
            {
              itemIndex: 0,
              comparablePrice: 22.5,
              comparableProduct: 'A4 Copy Paper 500 sheets',
              comparableVendor: 'Carlton Barbados',
              sourceUrl: 'https://carltonbarbados.bb/product/a4-paper',
            },
          ],
          groundingUris: [
            {
              uri: 'https://carltonbarbados.bb/product/a4-paper',
              title: 'A4 Copy Paper at Carlton',
            },
          ],
        }),
      );

      const result = await runComparison({
        lineItems: [
          { id: 'li-1', description: 'Office paper ream', total: 25 },
        ],
        allowlist: ALLOWLIST,
      });

      const r = result.get('li-1');
      expect(r?.kind).toBe('found');
      if (r?.kind === 'found') {
        expect(r.comparablePrice).toBe(22.5);
        expect(r.sourceUrl).toBe(
          'https://carltonbarbados.bb/product/a4-paper',
        );
        expect(r.sourceTitle).toBe('A4 Copy Paper at Carlton');
      }
    });

    it('accepts an allowlisted .com source (e.g. PriceSmart) when present in grounding', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({
          jsonItems: [
            {
              itemIndex: 0,
              comparablePrice: 18.99,
              comparableProduct: 'A4 paper bundle',
              comparableVendor: 'PriceSmart',
              sourceUrl: 'https://bb.pricesmart.com/sku/12345',
            },
          ],
          groundingUris: [
            {
              uri: 'https://bb.pricesmart.com/sku/12345',
              title: 'PriceSmart',
            },
          ],
        }),
      );

      const result = await runComparison({
        lineItems: [{ id: 'li-1', description: 'Office paper', total: 25 }],
        allowlist: ALLOWLIST,
      });

      const r = result.get('li-1');
      expect(r?.kind).toBe('found');
    });

    it('emits a "no-source" for items the model OMITS, even when others are found', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({
          jsonItems: [
            {
              itemIndex: 0,
              comparablePrice: 22,
              comparableProduct: 'Paper',
              comparableVendor: 'Carlton',
              sourceUrl: 'https://carltonbarbados.bb/p/paper',
            },
            // itemIndex 1 omitted — Gemini found no Barbados source for it
          ],
          groundingUris: [
            { uri: 'https://carltonbarbados.bb/p/paper', title: 'Paper' },
          ],
        }),
      );

      const result = await runComparison({
        lineItems: [
          { id: 'li-1', description: 'Office paper ream', total: 25 },
          { id: 'li-2', description: 'Specialty calligraphy ink', total: 50 },
        ],
        allowlist: ALLOWLIST,
      });

      expect(result.get('li-1')?.kind).toBe('found');
      expect(result.get('li-2')?.kind).toBe('skipped');
      const r2 = result.get('li-2');
      if (r2?.kind === 'skipped') expect(r2.reason).toBe('no-source');
    });

    it('rejects items with non-numeric or non-positive prices', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({
          jsonItems: [
            {
              itemIndex: 0,
              comparablePrice: 0,
              comparableProduct: 'Free thing',
              comparableVendor: 'Carlton',
              sourceUrl: 'https://carltonbarbados.bb/x',
            },
            {
              itemIndex: 1,
              comparablePrice: -5,
              comparableProduct: 'Negative thing',
              comparableVendor: 'Carlton',
              sourceUrl: 'https://carltonbarbados.bb/y',
            },
          ],
          groundingUris: [
            { uri: 'https://carltonbarbados.bb/x', title: 'x' },
            { uri: 'https://carltonbarbados.bb/y', title: 'y' },
          ],
        }),
      );

      const result = await runComparison({
        lineItems: [
          { id: 'li-1', description: 'Item 1', total: 10 },
          { id: 'li-2', description: 'Item 2', total: 10 },
        ],
        allowlist: ALLOWLIST,
      });

      expect(result.get('li-1')?.kind).toBe('skipped');
      expect(result.get('li-2')?.kind).toBe('skipped');
    });

    it('rejects items pointing to out-of-range itemIndex', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        geminiResponse({
          jsonItems: [
            {
              itemIndex: 99,
              comparablePrice: 22,
              comparableProduct: 'x',
              comparableVendor: 'x',
              sourceUrl: 'https://carltonbarbados.bb/x',
            },
          ],
          groundingUris: [
            { uri: 'https://carltonbarbados.bb/x', title: 'x' },
          ],
        }),
      );

      const result = await runComparison({
        lineItems: [{ id: 'li-1', description: 'Item 1', total: 10 }],
        allowlist: ALLOWLIST,
      });

      expect(result.get('li-1')?.kind).toBe('skipped');
    });
  });

  describe('Edge cases', () => {
    it('returns empty map for empty input, no Gemini call', async () => {
      const result = await runComparison({
        lineItems: [],
        allowlist: ALLOWLIST,
      });
      expect(result.size).toBe(0);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('handles markdown-fenced JSON response from the model', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '```json\n[{"itemIndex":0,"comparablePrice":22,"comparableProduct":"Paper","comparableVendor":"Carlton","sourceUrl":"https://carltonbarbados.bb/x"}]\n```',
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                {
                  web: { uri: 'https://carltonbarbados.bb/x', title: 'x' },
                },
              ],
            },
          },
        ],
      });

      const result = await runComparison({
        lineItems: [{ id: 'li-1', description: 'Paper', total: 10 }],
        allowlist: ALLOWLIST,
      });

      expect(result.get('li-1')?.kind).toBe('found');
    });

    it('handles a refusal text response gracefully (returns all no-source)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "I cannot find Barbados-local prices for these items.",
        candidates: [{ groundingMetadata: { groundingChunks: [] } }],
      });

      const result = await runComparison({
        lineItems: [{ id: 'li-1', description: 'Obscure thing', total: 10 }],
        allowlist: ALLOWLIST,
      });

      const r = result.get('li-1');
      expect(r?.kind).toBe('skipped');
      if (r?.kind === 'skipped') expect(r.reason).toBe('no-source');
    });
  });
});
