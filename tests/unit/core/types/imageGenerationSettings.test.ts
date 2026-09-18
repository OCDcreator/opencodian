/**
 * R-C2 image-generation settings normalization tests (design §5 test 8):
 * the model list migrates from absent → [], malformed entries are pruned,
 * the width clamps, the cleanup policy falls back to 'trash', and the
 * defaults exist on DEFAULT_SETTINGS.
 */

import {
  DEFAULT_SETTINGS,
  IMAGE_GENERATION_MAX_WIDTH_DEFAULT,
  normalizeImageGenerationAssetCleanup,
  normalizeImageGenerationMaxWidth,
  normalizeImageGenerationModels,
} from '../../../../src/core/types/settings';

function validModel(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'm1',
    displayName: 'Test model',
    apiFormat: 'openai-images',
    baseURL: 'https://api.example.com/v1/',
    apiKey: 'sk-secret',
    model: 'gpt-image-1',
    size: '1024x1024',
    ...overrides,
  };
}

describe('imageGenerationModels normalization (R-C2)', () => {
  it('absent or malformed values normalize to []', () => {
    expect(normalizeImageGenerationModels(undefined)).toEqual([]);
    expect(normalizeImageGenerationModels('nope')).toEqual([]);
    expect(normalizeImageGenerationModels([42, null, 'x'])).toEqual([]);
    expect(DEFAULT_SETTINGS.imageGenerationModels).toEqual([]);
  });

  it('keeps well-formed entries and trims fields', () => {
    const result = normalizeImageGenerationModels([validModel()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'm1',
      displayName: 'Test model',
      apiFormat: 'openai-images',
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-secret',
      model: 'gpt-image-1',
      size: '1024x1024',
    });
  });

  it('drops entries without baseURL or model (half-edited rows never persist)', () => {
    expect(normalizeImageGenerationModels([
      validModel({ baseURL: '' }),
      validModel({ model: '  ' }),
    ])).toEqual([]);
  });

  it('normalizes unknown apiFormat to openai-images and defaults the display name', () => {
    const result = normalizeImageGenerationModels([validModel({ apiFormat: 'sora', displayName: '' })]);
    expect(result[0]).toMatchObject({ apiFormat: 'openai-images', displayName: 'gpt-image-1' });
  });

  it('deduplicates ids by regenerating a fresh one', () => {
    const result = normalizeImageGenerationModels([validModel(), validModel()]);
    expect(result).toHaveLength(2);
    expect(result[0].id).not.toBe(result[1].id);
  });
});

describe('imageGenerationMaxWidth normalization (R-C2)', () => {
  it('defaults to 600 and clamps out-of-range values back to it', () => {
    expect(IMAGE_GENERATION_MAX_WIDTH_DEFAULT).toBe(600);
    expect(DEFAULT_SETTINGS.imageGenerationMaxWidth).toBe(600);
    expect(normalizeImageGenerationMaxWidth(undefined)).toBe(600);
    expect(normalizeImageGenerationMaxWidth('x')).toBe(600);
    expect(normalizeImageGenerationMaxWidth(-1)).toBe(600);
    expect(normalizeImageGenerationMaxWidth(100_001)).toBe(600);
  });

  it('passes finite in-range integers and rounds fractions', () => {
    expect(normalizeImageGenerationMaxWidth(0)).toBe(0);
    expect(normalizeImageGenerationMaxWidth(480)).toBe(480);
    expect(normalizeImageGenerationMaxWidth(600.4)).toBe(600);
  });
});

describe('imageGenerationAssetCleanup normalization (R-C2)', () => {
  it("falls back to 'trash' for anything unknown", () => {
    expect(DEFAULT_SETTINGS.imageGenerationAssetCleanup).toBe('trash');
    expect(normalizeImageGenerationAssetCleanup(undefined)).toBe('trash');
    expect(normalizeImageGenerationAssetCleanup('delete')).toBe('trash');
    expect(normalizeImageGenerationAssetCleanup('keep')).toBe('keep');
    expect(normalizeImageGenerationAssetCleanup('trash')).toBe('trash');
  });
});
