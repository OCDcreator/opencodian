/* eslint-disable max-lines */

import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';

import type {
  ProviderIconEntry,
  ProviderIconLibrary,
} from '../../core/types';
import { createLogger } from '../../shared';
import { parseBuiltinSource } from './builtinIconRegistry';
import {
  getActiveColorMode,
  getActiveDefaultVariant,
  getActiveThemeVariant,
  getBundledOpencodeAssetPath,
  getLobehubIconId,
  getMimeTypeForResolvedFormat,
  getPreviewUrlForEntry,
  getPreviewUrlForLobehubIcon,
  getResolvedFormatForMimeType,
  isLobehubBackedEntry,
  isLobehubBuiltinEntry,
} from './providerIconBuiltinSelection';
import {
  getMimeTypeFromPath,
  loadCustomSourceAsset,
  type LoadedIconAsset,
  loadRemoteImageAsset,
  normalizeCustomSource,
} from './providerIconCustomSources';
import {
  getProviderIconEntryIconId,
  getProviderIconEntrySourceLabel,
  mergeProviderIds,
  resolveProviderEntryResolution,
  uniqueProviderIds,
} from './providerIconEntryResolution';
import type {
  ProviderIconAssetCandidate,
  ProviderIconCacheEntry,
  ProviderIconCacheSummary,
  ProviderIconEntryPreviewMetadata,
  ProviderIconProviderState,
  ResolvedProviderIconAsset,
  ResolveIconUrlOptions,
} from './providerIconTypes';

export type {
  ProviderIconCacheEntry,
  ProviderIconCacheSummary,
  ProviderIconProviderState,
  ResolveIconUrlOptions,
} from './providerIconTypes';

export const ICON_CACHE_DIR = '.opencodian/provider-icons';

const logger = createLogger('ProviderIconService');
const loggedIconUrls = new Map<string, string | null>();
const resolvedIconUrls = new Map<string, ResolvedProviderIconAsset | null>();
const inFlightIconLoads = new Map<string, Promise<ResolvedProviderIconAsset | null>>();
const failedIconIds = new Set<string>();

export async function resolveProviderIconUrl(
  app: App,
  providerId: string,
  library: ProviderIconLibrary = {},
  options: ResolveIconUrlOptions = {},
): Promise<string | null> {
  const entry = resolveProviderEntryResolution(providerId, library)?.selectedEntry ?? null;
  if (!entry) {
    if (loggedIconUrls.get(providerId) !== null) {
      logger.debug(`No icon found for: ${providerId}`);
      loggedIconUrls.set(providerId, null);
    }

    return null;
  }

  const asset = await resolveEntryAsset(app, providerId, entry, options);
  return asset?.iconUrl ?? null;
}

export async function getProviderIconCacheState(
  app: App,
  currentProviderIds: string[],
  library: ProviderIconLibrary = {},
): Promise<{ providers: ProviderIconProviderState[]; summary: ProviderIconCacheSummary }> {
  const currentProviders = uniqueProviderIds(currentProviderIds);
  const allProviders = mergeProviderIds(currentProviders, Object.keys(library));

  const providers = await Promise.all(allProviders.map(async (providerId) => {
    const entries = await getProviderCacheEntries(app, providerId, library, currentProviders.includes(providerId));
    return {
      providerId,
      isCurrentProvider: currentProviders.includes(providerId),
      entries,
    } satisfies ProviderIconProviderState;
  }));

  providers.sort((left, right) => {
    if (left.isCurrentProvider !== right.isCurrentProvider) {
      return left.isCurrentProvider ? -1 : 1;
    }

    return left.providerId.localeCompare(right.providerId);
  });

  const totalIcons = providers.reduce((sum, provider) => sum + provider.entries.length, 0);
  const cachedIcons = providers.reduce(
    (sum, provider) => sum + provider.entries.filter((entry) => entry.cached).length,
    0,
  );
  const cachedProviders = providers.filter((provider) => provider.entries.some((entry) => entry.cached)).length;

  return {
    providers,
    summary: {
      currentProviders: currentProviders.length,
      totalProviders: providers.length,
      cachedProviders,
      totalIcons,
      cachedIcons,
    },
  };
}

export async function clearProviderIconCache(app: App): Promise<number> {
  resolvedIconUrls.clear();
  inFlightIconLoads.clear();
  loggedIconUrls.clear();
  failedIconIds.clear();

  const adapter = app.vault.adapter;
  const cacheDir = normalizePath(ICON_CACHE_DIR);

  try {
    const exists = await adapter.exists(cacheDir);
    if (!exists) {
      return 0;
    }

    const listing = await adapter.list(cacheDir);
    let removedCount = 0;

    for (const file of listing.files) {
      try {
        await adapter.remove(file);
        removedCount += 1;
      } catch (error) {
        logger.debug(`Failed to remove cached icon: ${file}`, error);
      }
    }

    logger.debug(`Cleared provider icon cache: removed ${removedCount} file(s)`);
    return removedCount;
  } catch (error) {
    logger.warn('Failed to clear provider icon cache', error);
    throw error;
  }
}

export async function warmProviderIcons(
  app: App,
  providerIds: string[],
  library: ProviderIconLibrary = {},
): Promise<{ total: number; supported: number; cached: number; failed: number }> {
  const uniqueIds = uniqueProviderIds(providerIds);

  let supported = 0;
  let cached = 0;
  let failed = 0;

  for (const providerId of uniqueIds) {
    const resolution = resolveProviderEntryResolution(providerId, library);
    if (!resolution?.selectedEntry) {
      continue;
    }

    supported += 1;
    const iconUrl = await resolveProviderIconUrl(app, providerId, library, { retryFailed: true });
    if (iconUrl) {
      cached += 1;
    } else {
      failed += 1;
    }
  }

  logger.debug(
    `Warm provider icons complete: total=${uniqueIds.length}, supported=${supported}, cached=${cached}, failed=${failed}`,
  );

  return {
    total: uniqueIds.length,
    supported,
    cached,
    failed,
  };
}

export async function writeProviderIconCacheAsset(
  app: App,
  cachePath: string | null,
  data: ArrayBuffer,
): Promise<void> {
  if (!cachePath) {
    return;
  }

  try {
    const adapter = app.vault.adapter;
    const dirExists = await adapter.exists(normalizePath(ICON_CACHE_DIR));
    if (!dirExists) {
      await adapter.mkdir(normalizePath(ICON_CACHE_DIR));
    }

    const writeBinary = adapter.writeBinary?.bind(adapter) as undefined | ((path: string, data: ArrayBuffer) => Promise<void>);
    if (!writeBinary) {
      throw new Error('Vault adapter does not support binary icon cache writes.');
    }

    await writeBinary(cachePath, data);
  } catch (error) {
    logger.debug(`Failed to write cached icon: ${cachePath}`, error);
    throw error;
  }
}

async function getProviderCacheEntries(
  app: App,
  providerId: string,
  library: ProviderIconLibrary,
  isCurrentProvider: boolean,
): Promise<ProviderIconCacheEntry[]> {
  const entries = resolveProviderEntryResolution(providerId, library)?.effectiveEntries ?? [];
  return Promise.all(entries.map(async (entry, index) => {
    const asset = await resolveEntryAsset(app, providerId, entry, { cacheOnly: true });
    const preview = resolveEntryPreviewMetadata(app, entry, asset);
    return {
      providerId,
      entry,
      iconId: preview.iconId,
      cached: asset?.cached ?? false,
      cachePath: asset?.cachePath ?? getCachePathForEntry(entry),
      iconUrl: preview.iconUrl,
      isCurrentProvider,
      isSelected: index === 0,
      requestedVariant: preview.requestedVariant,
      resolvedVariant: preview.resolvedVariant,
      resolvedFormat: preview.resolvedFormat,
      fallbackUsed: preview.fallbackUsed,
      sourceLabel: preview.sourceLabel,
    } satisfies ProviderIconCacheEntry;
  }));
}

async function resolveEntryAsset(
  app: App,
  providerId: string,
  entry: ProviderIconEntry,
  options: ResolveIconUrlOptions & { cacheOnly?: boolean } = {},
): Promise<ResolvedProviderIconAsset | null> {
  const runtimeKey = getEntryRuntimeKey(providerId, entry);
  if (!options.cacheOnly && resolvedIconUrls.has(runtimeKey)) {
    return resolvedIconUrls.get(runtimeKey) ?? null;
  }

  if (options.retryFailed) {
    failedIconIds.delete(runtimeKey);
  } else if (!options.cacheOnly && failedIconIds.has(runtimeKey)) {
    return null;
  }

  if (!options.cacheOnly) {
    const inFlight = inFlightIconLoads.get(runtimeKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const loadPromise = loadEntryAsset(app, providerId, entry, options);
  if (!options.cacheOnly) {
    inFlightIconLoads.set(runtimeKey, loadPromise);
  }

  try {
    const resolvedAsset = await loadPromise;
    if (!options.cacheOnly) {
      if (resolvedAsset) {
        resolvedIconUrls.set(runtimeKey, resolvedAsset);
      } else {
        resolvedIconUrls.delete(runtimeKey);
      }
    }

    return resolvedAsset;
  } finally {
    if (!options.cacheOnly) {
      inFlightIconLoads.delete(runtimeKey);
    }
  }
}

async function loadEntryAsset(
  app: App,
  providerId: string,
  entry: ProviderIconEntry,
  options: ResolveIconUrlOptions & { cacheOnly?: boolean },
): Promise<ResolvedProviderIconAsset | null> {
  const runtimeKey = getEntryRuntimeKey(providerId, entry);

  try {
    const asset = entry.type === 'mapped' || isLobehubBuiltinEntry(entry)
      ? await loadLobehubEntryAsset(app, entry, options.cacheOnly ?? false)
      : entry.type === 'builtin'
        ? await loadBundledBuiltinEntryAsset(app, providerId, entry, options.cacheOnly ?? false)
        : await loadCustomEntryAsset(app, entry, options.cacheOnly ?? false);

    if (!asset?.iconUrl && !options.cacheOnly) {
      failedIconIds.add(runtimeKey);
      return null;
    }

    failedIconIds.delete(runtimeKey);
    loggedIconUrls.set(providerId, asset?.iconUrl ?? null);
    return asset;
  } catch (error) {
    if (!options.cacheOnly) {
      failedIconIds.add(runtimeKey);
      logger.warn(`Failed to fetch icon for ${providerId}`, error);
    } else {
      logger.debug(`Failed to inspect icon cache for ${providerId}`, error);
    }

    return null;
  }
}

async function loadBundledOpencodeAsset(
  app: App,
  iconId: string,
  providerId: string,
): Promise<LoadedIconAsset> {
  const assetPath = getBundledOpencodeAssetPath(app, iconId);
  const adapter = app.vault.adapter;
  const exists = await adapter.exists(assetPath);
  if (!exists) {
    throw new Error(`Bundled OpenCode icon not found for ${providerId}: ${iconId}`);
  }

  const readBinary = adapter.readBinary?.bind(adapter) as undefined | ((targetPath: string) => Promise<ArrayBuffer>);
  if (!readBinary) {
    throw new Error('Vault adapter does not support binary reads for builtin icons.');
  }

  const data = await readBinary(assetPath);
  return {
    data,
    mimeType: getMimeTypeFromPath(assetPath) ?? 'image/svg+xml',
  };
}

async function loadLobehubEntryAsset(
  app: App,
  entry: ProviderIconEntry,
  cacheOnly: boolean,
): Promise<ResolvedProviderIconAsset | null> {
  const iconId = getLobehubIconId(entry);
  if (!iconId) {
    return null;
  }

  const candidateState = getPreviewUrlForLobehubIcon(iconId, entry.variant ?? 'auto', ICON_CACHE_DIR);
  if (!candidateState) {
    return null;
  }

  return resolveAssetFromCandidates(
    app,
    candidateState.candidates.map((candidate) => ({
      cacheMimeType: getMimeTypeForResolvedFormat(candidate.format),
      cachePath: candidate.cachePath,
      continueOnLoadError: true,
      fallbackUsed: candidate.fallbackUsed,
      iconId,
      loadAsset: () => loadRemoteImageAsset(candidate.remoteUrl),
      previewUrl: candidate.remoteUrl,
      requestedVariant: candidateState.requestedVariant,
      resolvedFormat: candidate.format,
      resolvedVariant: candidate.resolvedVariant,
      sourceLabel: getProviderIconEntrySourceLabel(entry),
    })),
    cacheOnly,
  );
}

async function loadBundledBuiltinEntryAsset(
  app: App,
  providerId: string,
  entry: ProviderIconEntry,
  cacheOnly: boolean,
): Promise<ResolvedProviderIconAsset | null> {
  const parsed = parseBuiltinSource(entry.source);
  if (!parsed) {
    return null;
  }

  const cachePath = getCachePathForEntry(entry);
  return resolveAssetFromCandidates(
    app,
    [{
      cacheMimeType: 'image/svg+xml',
      cachePath,
      fallbackUsed: false,
      iconId: parsed.iconId,
      loadAsset: () => loadBundledOpencodeAsset(app, parsed.iconId, providerId),
      previewResolvedFormat: 'svg',
      previewUrl: getPreviewUrlForEntry(app, entry),
      requestedVariant: 'auto',
      resolvedFormat: 'svg',
      resolvedVariant: 'mono',
      sourceLabel: getProviderIconEntrySourceLabel(entry),
    }],
    cacheOnly,
  );
}

async function loadCustomEntryAsset(
  app: App,
  entry: ProviderIconEntry,
  cacheOnly: boolean,
): Promise<ResolvedProviderIconAsset | null> {
  const cachePath = getCachePathForEntry(entry);
  return resolveAssetFromCandidates(
    app,
    [{
      cacheMimeType: entry.mimeType,
      cachePath,
      fallbackUsed: false,
      iconId: null,
      loadAsset: () => loadCustomSourceAsset(
        normalizeCustomSource(entry.source, entry.type === 'file' ? 'file' : 'url'),
      ),
      previewResolvedFormat: getResolvedFormatForMimeType(entry.mimeType),
      previewUrl: getPreviewUrlForEntry(app, entry),
      sourceLabel: getProviderIconEntrySourceLabel(entry),
    }],
    cacheOnly,
  );
}

async function resolveAssetFromCandidates(
  app: App,
  candidates: ProviderIconAssetCandidate[],
  cacheOnly: boolean,
): Promise<ResolvedProviderIconAsset | null> {
  for (const candidate of candidates) {
    const cachedAsset = await readCachedAssetByPath(app, candidate.cachePath, candidate.cacheMimeType);
    if (cachedAsset) {
      return createResolvedAsset(candidate, cachedAsset, true);
    }

    if (cacheOnly || !candidate.loadAsset) {
      continue;
    }

    try {
      const loadedAsset = await candidate.loadAsset();
      await writeProviderIconCacheAsset(app, candidate.cachePath, loadedAsset.data);
      return createResolvedAsset(candidate, loadedAsset, false);
    } catch (error) {
      if (candidate.continueOnLoadError) {
        continue;
      }

      throw error;
    }
  }

  if (!cacheOnly) {
    return null;
  }

  const previewCandidate = candidates[0];
  return previewCandidate ? createResolvedAsset(previewCandidate, null, false) : null;
}

function createResolvedAsset(
  candidate: ProviderIconAssetCandidate,
  asset: LoadedIconAsset | null,
  cached: boolean,
): ResolvedProviderIconAsset {
  return {
    cachePath: candidate.cachePath,
    cached,
    fallbackUsed: candidate.fallbackUsed,
    iconId: candidate.iconId,
    iconUrl: asset ? assetToDataUrl(asset) : candidate.previewUrl,
    requestedVariant: candidate.requestedVariant,
    resolvedFormat: candidate.resolvedFormat
      ?? (asset ? getResolvedFormatForMimeType(asset.mimeType) : candidate.previewResolvedFormat),
    resolvedVariant: candidate.resolvedVariant,
    sourceLabel: candidate.sourceLabel,
  };
}

async function readCachedAssetByPath(
  app: App,
  cachePath: string | null,
  fallbackMimeType?: string,
): Promise<LoadedIconAsset | null> {
  if (!cachePath) {
    return null;
  }

  try {
    const adapter = app.vault.adapter;
    const exists = await adapter.exists(cachePath);
    if (!exists) {
      return null;
    }

    const readBinary = adapter.readBinary?.bind(adapter) as undefined | ((path: string) => Promise<ArrayBuffer>);
    if (!readBinary) {
      return null;
    }

    const data = await readBinary(cachePath);
    return {
      data,
      mimeType: fallbackMimeType ?? getMimeTypeFromPath(cachePath) ?? 'image/svg+xml',
    };
  } catch (error) {
    logger.debug(`Failed to read cached icon: ${cachePath}`, error);
    return null;
  }
}

function getCachePathForEntry(entry: ProviderIconEntry): string | null {
  if (entry.type === 'mapped' || isLobehubBuiltinEntry(entry)) {
    const iconId = getLobehubIconId(entry);
    if (!iconId) {
      return null;
    }

    return getPreviewUrlForLobehubIcon(iconId, entry.variant ?? 'auto', ICON_CACHE_DIR)?.candidates[0]?.cachePath ?? null;
  }

  if (entry.type === 'builtin') {
    const parsed = parseBuiltinSource(entry.source);
    if (!parsed) {
      return null;
    }

    return normalizePath(`${ICON_CACHE_DIR}/builtin-${parsed.libraryId}-${parsed.iconId}.svg`);
  }

  if (!entry.cacheFileName) {
    return null;
  }

  return normalizePath(`${ICON_CACHE_DIR}/${entry.cacheFileName}`);
}

function getEntryRuntimeKey(providerId: string, entry: ProviderIconEntry): string {
  if (!isLobehubBackedEntry(entry)) {
    return `${providerId}::${entry.id}`;
  }

  const requestedVariant = entry.variant ?? 'auto';
  const activeVariant = getActiveDefaultVariant();
  const themeKey = getActiveThemeVariant();
  const colorMode = getActiveColorMode();
  return `${providerId}::${entry.id}::${requestedVariant}::${activeVariant}::${colorMode}::${themeKey}`;
}

function assetToDataUrl(asset: LoadedIconAsset): string {
  const base64 = Buffer.from(asset.data).toString('base64');
  return `data:${asset.mimeType};base64,${base64}`;
}

function resolveEntryPreviewMetadata(
  app: App,
  entry: ProviderIconEntry,
  asset: ResolvedProviderIconAsset | null,
): ProviderIconEntryPreviewMetadata {
  return {
    fallbackUsed: asset?.fallbackUsed ?? false,
      iconId: asset?.iconId ?? getProviderIconEntryIconId(entry),
      iconUrl: asset?.iconUrl ?? getPreviewUrlForEntry(app, entry),
      requestedVariant: asset?.requestedVariant ?? entry.variant,
      resolvedFormat: asset?.resolvedFormat,
      resolvedVariant: asset?.resolvedVariant,
      sourceLabel: asset?.sourceLabel ?? getProviderIconEntrySourceLabel(entry),
    };
}
