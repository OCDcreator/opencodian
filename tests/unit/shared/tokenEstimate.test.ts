/**
 * Token estimation tests (advantage-parity R-E6).
 *
 * The heuristic is an orientation number: Latin ≈ 4 chars/token, CJK ≈
 * 0.85 chars/token (×1.2), ceil-rounded; empty input is 0; the word count
 * treats each CJK char as one word.
 */

import {
  describeTextForTokenCount,
  estimateTokensFromText,
} from '../../../src/shared/tokenEstimate';

describe('estimateTokensFromText', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokensFromText('')).toBe(0);
  });

  it('estimates Latin text at ~4 chars per token (ceil)', () => {
    expect(estimateTokensFromText('aaaaaaaa')).toBe(2); // 8/4
    expect(estimateTokensFromText('aaaaaaa')).toBe(2); // ceil(7/4)
    expect(estimateTokensFromText('aaaa')).toBe(1);
  });

  it('estimates CJK text at 1.2 tokens per char (ceil)', () => {
    expect(estimateTokensFromText('中文内容')).toBe(5); // ceil(4*1.2)
    expect(estimateTokensFromText('中')).toBe(2); // ceil(1.2)
  });

  it('sums mixed scripts', () => {
    // 8 latin chars (2) + 5 CJK chars (6) = 8
    expect(estimateTokensFromText('aaaaaaaa中文内容啊')).toBe(8);
  });
});

describe('describeTextForTokenCount', () => {
  it('counts words as latin words + CJK chars and reports all facts', () => {
    const facts = describeTextForTokenCount('hello world 你好世界');
    expect(facts.chars).toBe('hello world 你好世界'.length);
    expect(facts.words).toBe(2 + 4);
    expect(facts.tokens).toBeGreaterThan(0);
  });
});
