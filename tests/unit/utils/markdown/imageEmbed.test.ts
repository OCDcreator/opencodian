import type { App } from 'obsidian';

import { replaceImageEmbedsWithHtml } from '../../../../src/utils/markdown/imageEmbed';

function createApp(knownPaths: Set<string>): App {
  return {
    vault: {
      getFileByPath: (path: string) => {
        if (!knownPaths.has(path)) {
          return null;
        }
        const name = path.split('/').pop() ?? path;
        return { path, basename: name.replace(/\.[^.]+$/, '') };
      },
      getResourcePath: (file: { path: string }) => `app://local/${encodeURIComponent(file.path)}`,
    },
    metadataCache: {
      getFirstLinkpathDest: () => null,
    },
  } as unknown as App;
}

describe('replaceImageEmbedsWithHtml image sizing', () => {
  const app = createApp(new Set(['img.png']));

  it('reserves a stable aspect-ratio box when the embed has no explicit size', () => {
    const html = replaceImageEmbedsWithHtml('![[img.png]]', { app });

    expect(html).toContain('<img');
    expect(html).toContain('has-intrinsic-placeholder');
    expect(html).toContain('style="aspect-ratio: auto 16 / 9;"');
  });

  it('sets only the declared width from explicit embed syntax', () => {
    const html = replaceImageEmbedsWithHtml('![[img.png|300]]', { app });

    expect(html).toContain('style="width: 300px;"');
    expect(html).not.toContain('height:');
    expect(html).not.toContain('has-intrinsic-placeholder');
  });

  it('sets declared width and height from explicit embed syntax', () => {
    const html = replaceImageEmbedsWithHtml('![[img.png|300x200]]', { app });

    expect(html).toContain('style="width: 300px; height: 200px;"');
    expect(html).not.toContain('has-intrinsic-placeholder');
  });

  it('ignores non-numeric alt text for sizing', () => {
    const html = replaceImageEmbedsWithHtml('![[img.png|a caption]]', { app });

    expect(html).toContain('alt="a caption"');
    expect(html).toContain('has-intrinsic-placeholder');
  });

  it('renders the fallback span when the image file cannot be resolved', () => {
    const html = replaceImageEmbedsWithHtml('![[missing.png]]', { app });

    expect(html).toContain('markdown-embedded-image-fallback');
    expect(html).not.toContain('<img');
  });
});
