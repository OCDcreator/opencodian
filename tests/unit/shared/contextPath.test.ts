import {
  contextPathFromFileUrl,
  normalizeContextAttachmentPath,
  normalizeContextPath,
  pathToContextFileUrl,
  resolveContextPath,
} from '../../../src/shared/contextPath';

describe('contextPath helpers', () => {
  it('normalizes Windows drive paths without depending on the host platform', () => {
    expect(normalizeContextPath('C:\\vault\\docs\\spec.md')).toBe('C:/vault/docs/spec.md');
    expect(normalizeContextPath('/C:/vault/docs/spec.md')).toBe('C:/vault/docs/spec.md');
  });

  it('resolves relative context paths against Windows vault roots', () => {
    expect(resolveContextPath('docs/spec.md', 'C:\\vault')).toBe('C:/vault/docs/spec.md');
  });

  it('restores vault-relative attachments from Windows absolute paths', () => {
    expect(normalizeContextAttachmentPath('C:\\vault\\notes\\today.md', 'C:\\vault')).toBe('notes/today.md');
  });

  it('round-trips Windows context file URLs with encoded characters', () => {
    const fileUrl = pathToContextFileUrl('C:\\vault\\obsidian 联动设置.md');

    expect(fileUrl).toBe('file:///C:/vault/obsidian%20%E8%81%94%E5%8A%A8%E8%AE%BE%E7%BD%AE.md');
    expect(contextPathFromFileUrl(fileUrl)).toBe('C:/vault/obsidian 联动设置.md');
  });
});
