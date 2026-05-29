import { GoogleGenAI } from '@google/genai';

/**
 * Lazy Gemini client singleton. SERVER-SIDE ONLY — never import this file
 * from a client component. The check on `process.env.GEMINI_API_KEY` happens
 * on first call (not at module load) so the Next.js build doesn't fail when
 * the key is absent locally.
 */
let _client: GoogleGenAI | undefined;

export function geminiClient(): GoogleGenAI {
  if (_client) return _client;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Configure it in `.env.local` (dev) or the Render dashboard (production).',
    );
  }

  _client = new GoogleGenAI({ apiKey });
  return _client;
}

/** Pinned model identifier — change here, not at call sites. */
export const GEMINI_MODEL = 'gemini-3-flash-preview';
