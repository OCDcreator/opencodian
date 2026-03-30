import { MarkdownRenderer as ObsidianMarkdownRenderer } from 'obsidian';

import { MarkdownRenderService } from '@/utils/markdown/MarkdownRenderer';

jest.mock('obsidian', () => {
  const actual = jest.requireActual('obsidian');

  return {
    ...actual,
    MarkdownRenderer: {
      renderMarkdown: jest.fn(),
    },
  };
});

describe('MarkdownRenderService', () => {
  const mockedRenderMarkdown = ObsidianMarkdownRenderer.renderMarkdown as jest.MockedFunction<
    typeof ObsidianMarkdownRenderer.renderMarkdown
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('truncates raw long URLs inside tables while preserving href and title', async () => {
    const longUrl =
      'https://example.com/articles/2026/research/' +
      'a'.repeat(70) +
      '/appendix/' +
      'b'.repeat(30);
    const customTextUrl = 'https://example.com/custom';
    const container = document.createElement('div');
    const renderTarget = document.createElement('div');
    const service = new MarkdownRenderService({
      app: {} as never,
      component: { registerDomEvent: jest.fn() } as never,
      container,
    });

    mockedRenderMarkdown.mockImplementation(async (_markdown, el) => {
      el.innerHTML = `
        <table>
          <tbody>
            <tr>
              <td><a href="${longUrl}">${longUrl}</a></td>
              <td><a href="${customTextUrl}">Example paper</a></td>
            </tr>
          </tbody>
        </table>
        <p><a href="${longUrl}">${longUrl}</a></p>
      `;
    });

    const result = await service.render(renderTarget, 'ignored');

    const [tableLongLink, tableCustomLink] = Array.from(
      renderTarget.querySelectorAll('table a')
    ) as HTMLAnchorElement[];
    const paragraphLink = renderTarget.querySelector('p a') as HTMLAnchorElement | null;

    expect(result.success).toBe(true);
    expect(tableLongLink.getAttribute('href')).toBe(longUrl);
    expect(tableLongLink.textContent).toBe(`${longUrl.slice(0, 36)}...${longUrl.slice(-18)}`);
    expect(tableLongLink.title).toBe(longUrl);
    expect(tableLongLink.getAttribute('aria-label')).toBe(longUrl);
    expect(tableCustomLink.textContent).toBe('Example paper');
    expect(tableCustomLink.title).toBe('');
    expect(paragraphLink?.textContent).toBe(longUrl);
    expect(paragraphLink?.title).toBe('');
  });

  it('leaves shorter table URLs unchanged', async () => {
    const shortUrl = 'https://example.com/paper';
    const container = document.createElement('div');
    const renderTarget = document.createElement('div');
    const service = new MarkdownRenderService({
      app: {} as never,
      component: { registerDomEvent: jest.fn() } as never,
      container,
    });

    mockedRenderMarkdown.mockImplementation(async (_markdown, el) => {
      el.innerHTML = `
        <table>
          <tbody>
            <tr>
              <td><a href="${shortUrl}">${shortUrl}</a></td>
            </tr>
          </tbody>
        </table>
      `;
    });

    await service.render(renderTarget, 'ignored');

    const link = renderTarget.querySelector('table a') as HTMLAnchorElement | null;

    expect(link?.textContent).toBe(shortUrl);
    expect(link?.title).toBe('');
    expect(link?.getAttribute('aria-label')).toBeNull();
  });
});
