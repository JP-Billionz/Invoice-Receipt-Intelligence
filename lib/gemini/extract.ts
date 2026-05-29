import { GEMINI_MODEL, geminiClient } from './client';
import { EXTRACTION_SYSTEM_PROMPT } from './prompts';
import {
  extractionResponseSchema,
  type ExtractedReceipt,
} from './schema';

const RETRY_MAX = 3;
const RETRY_INITIAL_DELAY_MS = 2000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Maps raw Gemini SDK errors into user-readable strings.
 * Ported from prototype `services/geminiService.ts` lines 13-34.
 */
function friendlyErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';

  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
    return 'The AI service is currently under very high demand. We attempted multiple retries, but the server is still busy. Please wait a minute before trying again.';
  }
  if (message.includes('SAFETY')) {
    return 'The AI could not process this image due to safety filters. Please ensure the receipt is clear and does not contain sensitive personal information.';
  }

  // Some Gemini errors embed structured JSON inside `.message`.
  try {
    const jsonMatch = message.match(/\{.*\}/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error?.message) return parsed.error.message;
    }
  } catch {
    /* fall through */
  }

  return (
    message || 'An unexpected error occurred while communicating with the AI.'
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      const errorMsg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : '';
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status?: number }).status
          : undefined;
      const isRateLimit =
        errorMsg.includes('429') ||
        errorMsg.includes('RESOURCE_EXHAUSTED') ||
        status === 429;

      if (isRateLimit && attempt < RETRY_MAX) {
        attempt += 1;
        const waitMs = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[gemini] rate limited — retry ${attempt}/${RETRY_MAX} in ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }
}

export interface ExtractInput {
  /** Raw image/PDF bytes encoded as base64 (no `data:...,` prefix). */
  base64: string;
  /** MIME type — e.g. `image/jpeg`, `image/png`, `application/pdf`. */
  mimeType: string;
}

/**
 * Calls Gemini to extract structured journal data from a receipt/invoice image
 * or PDF. SERVER-SIDE ONLY.
 *
 * Ported from prototype `services/geminiService.ts:analyzeReceipt`, with three
 * production hardenings:
 *   1. API key is read from server env (lazy init in `geminiClient`), never
 *      shipped to the client bundle (kickoff hardline #1).
 *   2. The prompt + schema are split into their own modules so they can be
 *      tuned without touching the call site.
 *   3. The output is validated minimally before being returned — Gemini
 *      occasionally produces well-formed JSON missing required scalar fields
 *      when the document is unreadable.
 */
export async function extractReceipt(
  input: ExtractInput,
): Promise<ExtractedReceipt> {
  const ai = geminiClient();

  const imagePart = {
    inlineData: {
      data: input.base64,
      mimeType: input.mimeType,
    },
  };

  const textPart = { text: EXTRACTION_SYSTEM_PROMPT };

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: extractionResponseSchema,
        },
      }),
    );

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error('Empty response from Gemini.');
    }
    const parsed = JSON.parse(jsonText) as ExtractedReceipt;

    if (
      !parsed.vendor ||
      !parsed.transactionDate ||
      !Array.isArray(parsed.entries)
    ) {
      throw new Error('Invalid data structure received from AI.');
    }

    return parsed;
  } catch (error: unknown) {
    console.error('[gemini] extractReceipt failed:', error);
    throw new Error(friendlyErrorMessage(error));
  }
}
