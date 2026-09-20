/**
 * WebViewerContextService unit tests (advantage-parity R-E2).
 *
 * The availability gate is the requirement: the entry only exists while the
 * core Web Viewer plugin is enabled AND the active leaf is a webviewer tab
 * with an http(s) URL; the built item is the R-E1 pending URL shape with the
 * tab title carried into label + metadata.
 */

import {
  buildWebViewerContextItem,
  getActiveWebViewerTabContext,
  isWebViewerAvailable,
} from '../../../../../src/features/chat/services/WebViewerContextService';

function fakeApp(options: {
  webviewerEnabled?: boolean;
  activeViewType?: string;
  state?: unknown;
  getStateThrows?: boolean;
}): never {
  return {
    internalPlugins: {
      plugins: options.webviewerEnabled === undefined
        ? {}
        : { webviewer: { enabled: options.webviewerEnabled } },
    },
    workspace: {
      activeLeaf: options.activeViewType === undefined
        ? null
        : {
          view: {
            getViewType: () => options.activeViewType ?? 'markdown',
            getState: async () => {
              if (options.getStateThrows) {
                throw new Error('state unavailable');
              }
              return options.state;
            },
          },
        },
    },
  } as never;
}

describe('isWebViewerAvailable', () => {
  it('requires the core plugin to exist and be enabled', () => {
    expect(isWebViewerAvailable(fakeApp({ webviewerEnabled: true }))).toBe(true);
    expect(isWebViewerAvailable(fakeApp({ webviewerEnabled: false }))).toBe(false);
    expect(isWebViewerAvailable(fakeApp({}))).toBe(false);
  });
});

describe('getActiveWebViewerTabContext', () => {
  it('returns url+title for an active webviewer tab with an http(s) url', async () => {
    const tab = await getActiveWebViewerTabContext(fakeApp({
      activeViewType: 'webviewer',
      state: { url: 'https://example.com/page', title: '  Example  ', mode: 'webview' },
    }));
    expect(tab).toEqual({ url: 'https://example.com/page', title: 'Example' });
  });

  it('returns null for non-webviewer tabs, no active leaf, bad urls, or state errors', async () => {
    expect(await getActiveWebViewerTabContext(fakeApp({ activeViewType: 'markdown' }))).toBeNull();
    expect(await getActiveWebViewerTabContext(fakeApp({}))).toBeNull();
    expect(await getActiveWebViewerTabContext(fakeApp({
      activeViewType: 'webviewer',
      state: { url: 'file:///etc/passwd' },
    }))).toBeNull();
    expect(await getActiveWebViewerTabContext(fakeApp({
      activeViewType: 'webviewer',
      state: { title: 'no url' },
    }))).toBeNull();
    expect(await getActiveWebViewerTabContext(fakeApp({
      activeViewType: 'webviewer',
      getStateThrows: true,
    }))).toBeNull();
  });
});

describe('buildWebViewerContextItem', () => {
  it('produces the R-E1 pending url item with the tab title', () => {
    const item = buildWebViewerContextItem({ url: 'https://example.com', title: 'Example Domain' });
    expect(item.kind).toBe('url');
    expect(item.path).toBe('https://example.com');
    expect(item.label).toBe('Example Domain');
    expect(item.url).toMatchObject({ href: 'https://example.com', status: 'pending', title: 'Example Domain' });
  });

  it('falls back to the url as label without a title', () => {
    const item = buildWebViewerContextItem({ url: 'https://example.com' });
    expect(item.label).toBe('https://example.com');
    expect(item.url?.title).toBeUndefined();
  });
});
