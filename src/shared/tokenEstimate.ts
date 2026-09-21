/**
 * Token estimation (advantage-parity R-E6): a documented heuristic used by
 * the selection/vault token-count commands. This is an ESTIMATE for user
 * orientation, never a billing or budget-enforcement number — the chat path's
 * authoritative context usage stays the backend's ContextRing snapshot.
 *
 * Heuristic (common industry approximation):
 * - Latin/digit/punctuation text averages ~4 characters per model token;
 * - CJK text averages ~0.85 characters per token (×1.2 tokens per char).
 * Mixed text sums both parts. Always rounded up.
 */

const CJK_RANGE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/g;

/** Estimated model tokens for a piece of text (heuristic, ceil-rounded). */
export function estimateTokensFromText(text: string): number {
  if (!text) {
    return 0;
  }
  const cjkChars = (text.match(CJK_RANGE) ?? []).length;
  const otherChars = text.length - cjkChars;
  return Math.ceil((otherChars / 4) + (cjkChars * 1.2));
}

/** Word/char facts for the command notice (CJK chars counted as words). */
export function describeTextForTokenCount(text: string): {
  chars: number;
  words: number;
  tokens: number;
} {
  const latinWords = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).length;
  const cjkChars = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  return {
    chars: text.length,
    words: latinWords + cjkChars,
    tokens: estimateTokensFromText(text),
  };
}
