import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildDshPromptBlocks, prepareDshPromptBlocks } from '../../../../../src/core/agents/backend/dsh/DshProtocolCodec';

const image = { mediaType: 'image/png', data: 'YQ==' };

describe('DSH ordered content admission', () => {
  it('preserves text/image order and adds context once while removing duplicate representations', () => {
    const blocks = buildDshPromptBlocks({ content: 'fallback', images: [image], options: { requestParts: [
      { type: 'text', text: 'before' },
      { type: 'file', mime: image.mediaType, url: `data:${image.mediaType};base64,${image.data}` },
      { type: 'text', text: 'after' },
    ] } }, '[POLICY]\n\n', '[CONTEXT]', true);
    expect(blocks).toEqual([
      { type: 'text', text: '[POLICY]\n\nbefore' },
      { type: 'image', mimeType: image.mediaType, data: image.data },
      { type: 'text', text: 'after\n\n[CONTEXT]' },
    ]);
  });

  it('retains intentional repeated attachments and fails closed for unsupported parts', () => {
    expect(buildDshPromptBlocks({ content: 'compare', images: [image, image] }, '', '', true)
      .filter((block) => block.type === 'image')).toHaveLength(2);
    expect(() => buildDshPromptBlocks({ content: '', options: { requestParts: [{ type: 'agent', name: 'unsupported' }] } }, '', '', true))
      .toThrow('unsupported structured prompt part');
    expect(() => buildDshPromptBlocks({ content: '', images: [image] }, '', '', false)).toThrow('did not advertise');
  });

  it('reads picker image bytes in order while rejecting Vault escapes and remote image metadata', async () => {
    const scope = await mkdtemp(path.join(os.tmpdir(), 'opencodian-dsh-image-codec-'));
    const vault = path.join(scope, 'vault'); await mkdir(vault);
    const file = path.join(vault, 'image with spaces.png'); await writeFile(file, Buffer.from(image.data, 'base64'));
    const request = (url: string) => ({ content: 'look', options: { requestParts: [
      { type: 'text', text: 'before' }, { type: 'file', mime: 'image/png', url }, { type: 'text', text: 'after' },
    ] } });
    const options = { prefix: '', suffix: '', supportsImages: true, attachmentRoot: vault };
    await expect(prepareDshPromptBlocks(request(pathToFileURL(file).href), options)).resolves.toEqual([
      { type: 'text', text: 'before' }, { type: 'image', mimeType: image.mediaType, data: image.data }, { type: 'text', text: 'after' },
    ]);
    const outside = path.join(scope, 'outside.png'); await writeFile(outside, 'private');
    await expect(prepareDshPromptBlocks(request(pathToFileURL(outside).href), options)).rejects.toThrow('outside the Vault');
    const escape = path.join(vault, 'escape.png'); await symlink(outside, escape);
    await expect(prepareDshPromptBlocks(request(pathToFileURL(escape).href), options)).rejects.toThrow('symlink escapes');
    await expect(prepareDshPromptBlocks(request('https://example.invalid/image.png'), options)).rejects.toThrow('base64 payload');
    await expect(prepareDshPromptBlocks(request(pathToFileURL(file).href), { ...options, supportsImages: false })).rejects.toThrow('did not advertise');
  });
});
