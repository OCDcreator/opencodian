import {
  getContextPathExtension,
  isEligibleContextFilePath,
  isHiddenContextPath,
  resolveContextMimeFromPath,
} from '../../../src/shared/obsidianContext';

describe('obsidianContext helpers', () => {
  it('detects hidden paths inside dot folders', () => {
    expect(isHiddenContextPath('.obsidian/plugins/opencodian/data.json')).toBe(true);
    expect(isHiddenContextPath('notes/daily.md')).toBe(false);
  });

  it('extracts file extensions for text and attachment files', () => {
    expect(getContextPathExtension('notes/daily.md')).toBe('md');
    expect(getContextPathExtension('config/app.json')).toBe('json');
    expect(getContextPathExtension('assets/image.png')).toBe('png');
    expect(getContextPathExtension('assets/archive.zip')).toBe('zip');
  });

  it('resolves mime types for common attachment files', () => {
    expect(resolveContextMimeFromPath('assets/image.png')).toBe('image/png');
    expect(resolveContextMimeFromPath('docs/spec.pdf')).toBe('application/pdf');
    expect(resolveContextMimeFromPath('docs/archive.customext')).toBe('application/octet-stream');
  });

  it('marks all non-hidden files with suffixes as eligible context picker entries', () => {
    expect(isEligibleContextFilePath('notes/daily.md')).toBe(true);
    expect(isEligibleContextFilePath('assets/image.png')).toBe(true);
    expect(isEligibleContextFilePath('docs/slides.pptx')).toBe(true);
    expect(isEligibleContextFilePath('.obsidian/plugins/opencodian/data.json')).toBe(false);
    expect(isEligibleContextFilePath('obsidian-sample-plugin/node_modules/pkg/index.js')).toBe(true);
    expect(isEligibleContextFilePath('obsidian-sample-plugin/dist/main.js')).toBe(true);
    expect(isEligibleContextFilePath('docs/LICENSE')).toBe(false);
  });
});
