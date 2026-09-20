/**
 * WebViewerContextService — R-E2 (advantage-parity): the active Obsidian
 * core Web Viewer tab as a context source.
 *
 * Requirement: the entry point only exists while the Web Viewer core plugin
 * is enabled AND the active leaf is a webviewer tab; attaching reuses R-E1's
 * URL context item type verbatim (send-time local fetch, same SSRF gates).
 *
 * Scope deviation (registered in the requirements doc): the requirement
 * mentions "URL + selection"; under R-E1 the full page is fetched at send, so
 * the selection's text is subsumed in the fetched payload — attaching only
 * the URL loses no context. Selection-only attach would need a new item kind
 * and a composer quote seam; deferred until a real need appears.
 *
 * API surface (probed live on Obsidian 1.13.7): the core plugin lives at
 * `app.internalPlugins.plugins.webviewer` (`.enabled`); webviewer leaves have
 * view type `'webviewer'` and `getState()` → `{ url, title }`.
 */

import type { App } from 'obsidian';

import type { PromptContextItem } from '../../../core/types';
import { buildPendingUrlContextItem } from './UrlContextFetchService';

export interface WebViewerTabContext {
  url: string;
  title?: string;
}

/** True when the core Web Viewer plugin exists and is enabled. */
export function isWebViewerAvailable(app: App): boolean {
  const webviewer = (app as unknown as {
    internalPlugins?: { plugins?: Record<string, { enabled?: boolean } | undefined> };
  }).internalPlugins?.plugins?.webviewer;
  return webviewer?.enabled === true;
}

/**
 * The active leaf's webviewer tab state, or null when the active leaf is not
 * a webviewer tab (or the state cannot be read).
 */
export async function getActiveWebViewerTabContext(app: App): Promise<WebViewerTabContext | null> {
  const activeLeaf = (app.workspace as unknown as {
    activeLeaf?: { view?: { getViewType?: () => string; getState?: () => Promise<unknown> } } | null;
  }).activeLeaf;
  const view = activeLeaf?.view;
  if (!view || view.getViewType?.() !== 'webviewer') {
    return null;
  }
  try {
    const state = await view.getState?.();
    if (!state || typeof state !== 'object') {
      return null;
    }
    const url = (state as { url?: unknown }).url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return null;
    }
    const title = (state as { title?: unknown }).title;
    return {
      url,
      title: typeof title === 'string' && title.trim() ? title.trim() : undefined,
    };
  } catch {
    return null;
  }
}

/** Build the R-E1 pending URL context item for the open tab. */
export function buildWebViewerContextItem(tab: WebViewerTabContext): PromptContextItem {
  const item = buildPendingUrlContextItem(tab.url);
  return {
    ...item,
    label: tab.title ? tab.title : item.label,
    url: { ...item.url!, title: tab.title },
  };
}
