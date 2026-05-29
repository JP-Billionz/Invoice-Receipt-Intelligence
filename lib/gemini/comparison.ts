import { GEMINI_MODEL, geminiClient } from './client';
import { checkBarbadosLocality, parseAllowlist } from './locality';
import { isUtilityLineItem } from '@/lib/utilities-check';

/**
 * Per-line-item comparison result.
 *
 * The discriminated union FORCES every consumer (DB write, UI render) to
 * acknowledge BOTH the `found` and `skipped` cases. There is intentionally
 * no "found but no source" variant — that would be the hallucination state
 * the kickoff hardline forbids.
 */
export type ComparisonResult =
  | {
      kind: 'skipped';
      reason: 'utility' | 'no-source';
      searchedAt: Date;
    }
  | {
      kind: 'found';
      comparablePrice: number;
      comparableProduct: string;
      comparableVendor: string;
      sourceUrl: string;
      sourceTitle: string;
      searchedAt: Date;
    };

export interface ComparisonLineItem {
  id: string;
  description: string;
  total: number;
}

export interface RunComparisonInput {
  /** Line items to compare. Utilities are filtered out before Gemini is called. */
  lineItems: ComparisonLineItem[];
  /** Receipt image, optional. When present, Gemini sees the visual product —
   *  materially improves match quality. */
  imageBase64?: string;
  imageMimeType?: string;
  /** Comma-separated allowlist from env (BB_RETAILER_ALLOWLIST), or empty. */
  allowlist: string;
}

interface ModelComparisonItem {
  itemIndex: number;
  comparablePrice: number;
  comparableProduct: string;
  comparableVendor: string;
  sourceUrl: string;
}

/**
 * Run Barbados-grounded comparisons for the line items on a scan.
 *
 * Returns a map keyed by `lineItem.id`. EVERY input line item is represented
 * in the output — utility items get `{ kind: 'skipped', reason: 'utility' }`
 * without Gemini ever being called; items where no real Barbados-local
 * source was returned get `{ kind: 'skipped', reason: 'no-source' }`.
 *
 * This function enforces the kickoff non-negotiables in code:
 *   1. Never invent values. If Gemini returns nothing locally, the result
 *      is `no-source`, never a fabricated price.
 *   2. Sources must be cited. A `found` result requires a sourceUrl that
 *      (a) parses as a URL, (b) is Barbados-local per checkBarbadosLocality,
 *      and (c) appears in the call's groundingChunks (proves Gemini's
 *      Google-Search tool actually fetched it — the model can't hallucinate
 *      a URL that wasn't in its retrieval set).
 *   3. Skip utilities entirely. Electricity/water descriptions never hit
 *      the wire.
 */
export async function runComparison(
  input: RunComparisonInput,
): Promise<Map<string, ComparisonResult>> {
  const searchedAt = new Date();
  const allowlistParsed = parseAllowlist(input.allowlist);

  const result = new Map<string, ComparisonResult>();

  // Step 1: utilities never see Gemini.
  const eligible: ComparisonLineItem[] = [];
  for (const li of input.lineItems) {
    if (isUtilityLineItem(li.description)) {
      result.set(li.id, {
        kind: 'skipped',
        reason: 'utility',
        searchedAt,
      });
    } else {
      eligible.push(li);
    }
  }

  // Default every eligible item to no-source — overridden below for the ones
  // Gemini actually returns with valid Barbados sources. Default-skipped
  // means "if anything goes wrong from here on, the result is blank, never
  // a fabricated price".
  for (const li of eligible) {
    result.set(li.id, {
      kind: 'skipped',
      reason: 'no-source',
      searchedAt,
    });
  }

  if (eligible.length === 0) return result;

  // Step 2: Gemini call with Google-Search grounding.
  let modelItems: ModelComparisonItem[];
  let groundingUris: Set<string>;
  let groundingByUri: Map<string, { uri: string; title: string }>;

  try {
    const parts: Array<
      { text: string } | { inlineData: { data: string; mimeType: string } }
    > = [];
    if (input.imageBase64 && input.imageMimeType) {
      parts.push({
        inlineData: {
          data: input.imageBase64,
          mimeType: input.imageMimeType,
        },
      });
    }
    parts.push({ text: buildComparisonPrompt(eligible, allowlistParsed) });

    const ai = geminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    modelItems = parseModelResponse(response.text);
    const chunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    groundingByUri = new Map();
    for (const c of chunks) {
      const web = c?.web;
      if (web?.uri) {
        groundingByUri.set(web.uri, {
          uri: web.uri,
          title: web.title ?? '',
        });
      }
    }
    groundingUris = new Set(groundingByUri.keys());
  } catch (error) {
    console.error('[gemini] comparison call failed:', error);
    // Fail-closed: every eligible item stays at `no-source`. Never throw a
    // hallucinated price out of this path.
    return result;
  }

  // Step 3: per-item validation.
  for (const item of modelItems) {
    const lineItem = eligible[item.itemIndex];
    if (!lineItem) {
      // itemIndex out of range — ignore.
      continue;
    }

    if (
      typeof item.comparablePrice !== 'number' ||
      !Number.isFinite(item.comparablePrice) ||
      item.comparablePrice <= 0
    ) {
      continue;
    }

    if (typeof item.sourceUrl !== 'string' || item.sourceUrl.length === 0) {
      continue;
    }

    // sourceUrl MUST appear in the call's groundingChunks — proves the model
    // is citing a real retrieval, not fabricating a URL.
    if (!groundingUris.has(item.sourceUrl)) {
      continue;
    }

    // sourceUrl MUST pass the Barbados locality check.
    const locality = checkBarbadosLocality(item.sourceUrl, allowlistParsed);
    if (!locality.isLocal) {
      continue;
    }

    const groundingMeta = groundingByUri.get(item.sourceUrl);

    result.set(lineItem.id, {
      kind: 'found',
      comparablePrice: item.comparablePrice,
      comparableProduct:
        String(item.comparableProduct ?? '').trim() || lineItem.description,
      comparableVendor:
        String(item.comparableVendor ?? '').trim() ||
        (locality.hostname ?? ''),
      sourceUrl: item.sourceUrl,
      sourceTitle:
        groundingMeta?.title || String(item.comparableVendor ?? '').trim(),
      searchedAt,
    });
  }

  return result;
}

function buildComparisonPrompt(
  items: ComparisonLineItem[],
  allowlist: readonly string[],
): string {
  const itemList = items
    .map((li, i) => `  [${i}] ${li.description}  (paid: ${li.total})`)
    .join('\n');

  const allowlistHint =
    allowlist.length > 0
      ? `Preferred Barbados retailers: ${allowlist.join(', ')}`
      : 'Use any verifiable Barbados retailer source.';

  return `You are a Barbados-local market research assistant. Find current retail prices for the items below at BARBADOS RETAILERS ONLY.

Items to research:
${itemList}

${allowlistHint}

STRICT RULES — non-negotiable:
1. Barbados ONLY. Acceptable sources: ".bb" TLD domains, or the listed retailers above. Reject US, UK, Caribbean-non-Barbados, and global e-commerce sources (Amazon, eBay, Walmart, etc.) entirely.
2. If you cannot find a Barbados-local price for an item, OMIT that item from your response. Do NOT include estimates, approximations, "comparable region" prices, currency conversions, or best guesses.
3. Every item in your response MUST include a sourceUrl pointing to a real Barbados retailer product page. The URL must be one your Google Search tool actually retrieved.
4. Return ONLY a JSON array. No prose, no markdown code fences, no explanations.

Output schema (JSON array):
[
  {
    "itemIndex": <integer matching the input item index>,
    "comparablePrice": <number, in BBD>,
    "comparableProduct": "<exact product name from the source page>",
    "comparableVendor": "<retailer name>",
    "sourceUrl": "<full URL to the product page>"
  }
]

If NO items have Barbados-local matches, return [].`;
}

function parseModelResponse(
  text: string | null | undefined,
): ModelComparisonItem[] {
  if (!text) return [];
  let stripped = text.trim();

  // Strip markdown fences if the model added them despite the prompt.
  if (stripped.startsWith('```json')) {
    stripped = stripped.slice(7);
    if (stripped.endsWith('```')) stripped = stripped.slice(0, -3);
  } else if (stripped.startsWith('```')) {
    stripped = stripped.slice(3);
    if (stripped.endsWith('```')) stripped = stripped.slice(0, -3);
  }
  stripped = stripped.trim();

  // Empty / refusal / non-JSON: treat as "no results".
  if (
    stripped.length === 0 ||
    stripped.toLowerCase().includes("i can't") ||
    stripped.toLowerCase().includes('i cannot') ||
    stripped.toLowerCase().includes("i don't")
  ) {
    return [];
  }

  try {
    const parsed = JSON.parse(stripped);
    return Array.isArray(parsed) ? (parsed as ModelComparisonItem[]) : [];
  } catch {
    // Last-ditch: try to grab the first [...] block.
    const match = stripped.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed)
          ? (parsed as ModelComparisonItem[])
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
