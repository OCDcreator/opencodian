/**
 * Provider Icon Service
 * 
 * Uses Lobehub Icons (https://lobehub.com/icons) CDN for provider logos
 * CDN URL: https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{id}.svg
 */

import * as fs from 'fs';
import type { App } from 'obsidian';
import { normalizePath, requestUrl } from 'obsidian';
import * as path from 'path';

import type {
  LobehubIconVariant,
  ProviderIconColorMode,
  ProviderIconEntry,
  ProviderIconLibrary,
  ProviderIconResolvedFormat,
  StaticLobehubIconVariant,
} from '../../core/types';
import { createLogger } from '../../shared';
import {
  type BuiltinIconDefinition,
  type BuiltinIconLibraryId,
  findBuiltinIcon,
  formatBuiltinSource,
  getBuiltinIcon,
  parseBuiltinSource,
  PROVIDER_ICON_MAP,
  resolveBuiltinIconMatch,
  searchBuiltinIcons,
} from './builtinIconRegistry';
import {
  LOBEHUB_ICON_MANIFEST,
  type LobehubManifestEntry,
} from './lobehubIconManifest';

const logger = createLogger('ProviderIconService');
const loggedIconUrls = new Map<string, string | null>();
const resolvedIconUrls = new Map<string, ResolvedProviderIconAsset | null>();
const inFlightIconLoads = new Map<string, Promise<ResolvedProviderIconAsset | null>>();
const failedIconIds = new Set<string>();

export interface ProviderIconCacheEntry {
  providerId: string;
  entry: ProviderIconEntry;
  iconId: string | null;
  cached: boolean;
  cachePath: string | null;
  iconUrl: string | null;
  isCurrentProvider: boolean;
  isSelected: boolean;
  requestedVariant?: LobehubIconVariant;
  resolvedVariant?: Exclude<LobehubIconVariant, 'auto' | 'combine'>;
  resolvedFormat?: ProviderIconResolvedFormat;
  fallbackUsed?: boolean;
  sourceLabel: string;
}

export interface ProviderIconProviderState {
  providerId: string;
  isCurrentProvider: boolean;
  entries: ProviderIconCacheEntry[];
}

export interface ProviderIconCacheSummary {
  currentProviders: number;
  totalProviders: number;
  cachedProviders: number;
  totalIcons: number;
  cachedIcons: number;
}

export interface BuiltinIconOption {
  libraryId: BuiltinIconLibraryId;
  iconId: string;
  displayName: string;
  source: string;
  previewUrl: string | null;
  previewCandidates: string[];
  requestedVariant: LobehubIconVariant;
  resolvedVariant?: Exclude<LobehubIconVariant, 'auto' | 'combine'>;
  resolvedFormat?: ProviderIconResolvedFormat;
  staticVariants: StaticLobehubIconVariant[];
  supportedVariants: LobehubIconVariant[];
  isRecommended: boolean;
  isSelected: boolean;
}

interface ResolveIconUrlOptions {
  retryFailed?: boolean;
}

interface LoadedIconAsset {
  data: ArrayBuffer;
  mimeType: string;
}

interface ResolvedProviderIconAsset {
  cachePath: string | null;
  cached: boolean;
  fallbackUsed: boolean;
  iconId: string | null;
  iconUrl: string | null;
  requestedVariant?: LobehubIconVariant;
  resolvedFormat?: ProviderIconResolvedFormat;
  resolvedVariant?: Exclude<LobehubIconVariant, 'auto' | 'combine'>;
  sourceLabel: string;
}

interface NormalizedCustomSource {
  type: 'url' | 'file';
  source: string;
  localPath?: string;
}

interface SelectBuiltinIconRequest {
  providerId: string;
  libraryId: BuiltinIconLibraryId;
  iconId: string;
  library: ProviderIconLibrary;
  variant?: LobehubIconVariant;
}

interface LobehubCachePathOptions {
  iconId: string;
  requestedVariant: LobehubIconVariant;
  resolvedVariant: ResolvedLobehubVariant;
  format: ProviderIconResolvedFormat;
  themeKey: 'light' | 'dark';
}

type ResolvedLobehubVariant = Exclude<LobehubIconVariant, 'auto' | 'combine'>;

// CDN base URL for Lobehub icons
const LOBEHUB_CDN_BASE = 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons';
const ICON_CACHE_DIR = '.opencodian/provider-icons';
const MAX_ICON_BYTES = 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const LOBEHUB_MANIFEST_BY_ICON_ID = new Map(LOBEHUB_ICON_MANIFEST.map((entry) => [entry.iconId, entry]));
const ALL_VARIANT_OPTIONS: LobehubIconVariant[] = [
  'auto',
  'mono',
  'color',
  'brand',
  'brand-color',
  'text',
  'text-cn',
  'text-color',
  'combine',
  'avatar',
];

export class ProviderIconService {
  /**
   * Get icon URL for a provider
   */
  static getIconUrl(providerId: string): string | null {
    const iconId = this.getIconId(providerId);
    if (!iconId) {
      return null;
    }

    return this.getPreviewUrlForLobehubIcon(iconId, 'auto')?.previewUrl ?? null;
  }

  static async resolveIconUrl(
    app: App,
    providerId: string,
    library: ProviderIconLibrary = {},
    options: ResolveIconUrlOptions = {},
  ): Promise<string | null> {
    const entry = this.getEffectiveEntries(providerId, library)[0] ?? null;
    if (!entry) {
      if (loggedIconUrls.get(providerId) !== null) {
        logger.debug(`No icon found for: ${providerId}`);
        loggedIconUrls.set(providerId, null);
      }
      return null;
    }

    const asset = await this.resolveEntryAsset(app, providerId, entry, options);
    return asset?.iconUrl ?? null;
  }
  
  /**
   * Get icon ID for a provider
   * Tries multiple normalization strategies for better matching
   */
  static getIconId(providerId: string): string | null {
    if (!providerId) return null;
    
    // Strategy 1: Direct lowercase match
    const lowerId = providerId.toLowerCase();
    if (PROVIDER_ICON_MAP[lowerId]) {
      return PROVIDER_ICON_MAP[lowerId];
    }
    
    // Strategy 2: Remove spaces and special chars, keep alphanumeric
    const normalizedId = lowerId.replace(/[^a-z0-9]/g, '');
    if (PROVIDER_ICON_MAP[normalizedId]) {
      return PROVIDER_ICON_MAP[normalizedId];
    }
    
    // Strategy 3: Extract English parts (for names like "AiHubMix (推理时代)")
    const englishParts = lowerId.match(/[a-z]+/g);
    if (englishParts) {
      // Try each English part
      for (const part of englishParts) {
        if (part.length < 2) continue; // Skip single letters
        if (PROVIDER_ICON_MAP[part]) {
          return PROVIDER_ICON_MAP[part];
        }
      }
      
      // Try combined English parts
      const combined = englishParts.join('');
      if (PROVIDER_ICON_MAP[combined]) {
        return PROVIDER_ICON_MAP[combined];
      }
    }
    
    // Strategy 4: Partial match - check if any key is contained in the providerId
    for (const [key, value] of Object.entries(PROVIDER_ICON_MAP)) {
      if (normalizedId.includes(key) || lowerId.includes(key)) {
        return value;
      }
    }
    
    // Strategy 5: Reverse partial match - check if providerId is contained in any key
    for (const [key, value] of Object.entries(PROVIDER_ICON_MAP)) {
      if (key.includes(normalizedId) || key.includes(lowerId)) {
        return value;
      }
    }
    
    return null;
  }
  
  /**
   * Check if provider has an icon
   */
  static hasIcon(providerId: string): boolean {
    return this.getDefaultEntry(providerId) !== null;
  }

  static listBuiltinIconOptions(
    app: App,
    providerId: string,
    library: ProviderIconLibrary = {},
    options: {
      query?: string;
      libraryId?: BuiltinIconLibraryId;
      requestedVariant?: LobehubIconVariant;
    } = {},
  ): BuiltinIconOption[] {
    const currentSource = this.getSelectedBuiltinSource(providerId, library);
    const selectedVariant = this.getSelectedBuiltinVariant(providerId, library);
    const requestedVariant = options.requestedVariant ?? selectedVariant;
    const recommended = this.getRecommendedBuiltinIcons(providerId, options.libraryId);
    const recommendedSourceSet = new Set(recommended.map((item) => item.source));
    const query = options.query?.trim() ?? '';
    const definitions = query
      ? searchBuiltinIcons(query, {
          libraryId: options.libraryId,
        })
      : [
          ...recommended,
          ...searchBuiltinIcons('', { libraryId: options.libraryId }),
        ].filter((definition, index, collection) =>
          collection.findIndex((candidate) => candidate.source === definition.source) === index,
        );

    return definitions
      .filter((definition) => this.isDefinitionAvailableForVariant(definition, requestedVariant))
      .map((definition) => {
        const preview = this.getBuiltinPreview(app, definition, requestedVariant);
        return {
          libraryId: definition.libraryId,
          iconId: definition.iconId,
          displayName: definition.displayName,
          source: definition.source,
          previewUrl: preview.previewUrl,
          previewCandidates: preview.previewCandidates,
          requestedVariant: requestedVariant,
          resolvedVariant: preview.resolvedVariant,
          resolvedFormat: preview.resolvedFormat,
          staticVariants: definition.lobehub?.staticVariants ?? ['mono'],
          supportedVariants: definition.lobehub?.supportedVariants ?? ['auto', 'mono'],
          isRecommended: recommendedSourceSet.has(definition.source),
          isSelected: currentSource === definition.source && (
            requestedVariant === 'auto'
            || selectedVariant === 'auto'
            || definition.libraryId !== 'lobehub'
            || selectedVariant === requestedVariant
          ),
        } satisfies BuiltinIconOption;
      });
  }

  static selectBuiltinIcon({
    providerId,
    libraryId,
    iconId,
    library,
    variant = 'auto',
  }: SelectBuiltinIconRequest): ProviderIconLibrary {
    const trimmedProviderId = providerId.trim();
    if (!trimmedProviderId) {
      return library;
    }

    const builtinDefinition = getBuiltinIcon(libraryId, iconId);
    if (!builtinDefinition) {
      return library;
    }

    const resolvedProviderId = this.resolveLibraryProviderId(trimmedProviderId, library) ?? trimmedProviderId;
    const existingEntries = this.getEditableEntriesForProvider(resolvedProviderId, library);
    const selectedEntry = this.createBuiltinEntry(
      libraryId,
      iconId,
      true,
      libraryId === 'lobehub' ? variant : 'auto',
    );

    const dedupedEntries = existingEntries.filter((entry) => !this.areEquivalentEntries(entry, selectedEntry));
    return this.updateProviderEntries(
      resolvedProviderId,
      [selectedEntry, ...dedupedEntries],
      library,
    );
  }

  static getSelectedBuiltinSource(providerId: string, library: ProviderIconLibrary = {}): string | null {
    const selectedEntry = this.getEffectiveEntries(providerId, library)[0] ?? null;
    if (!selectedEntry) {
      return null;
    }

    if (selectedEntry.type === 'builtin') {
      return selectedEntry.source;
    }

    if (selectedEntry.type === 'mapped') {
      return formatBuiltinSource('lobehub', selectedEntry.source);
    }

    return null;
  }

  static getSelectedBuiltinVariant(providerId: string, library: ProviderIconLibrary = {}): LobehubIconVariant {
    const selectedEntry = this.getEffectiveEntries(providerId, library)[0] ?? null;
    if (!selectedEntry) {
      return this.getActiveDefaultVariant();
    }

    return selectedEntry.variant ?? 'auto';
  }

  /**
   * Build state for current and persisted provider icon entries using local cache only.
   */
  static async getProviderCacheState(
    app: App,
    currentProviderIds: string[],
    library: ProviderIconLibrary = {},
  ): Promise<{ providers: ProviderIconProviderState[]; summary: ProviderIconCacheSummary }> {
    const currentProviders = this.uniqueProviderIds(currentProviderIds);
    const allProviders = this.mergeProviderIds(currentProviders, Object.keys(library));

    const providers = await Promise.all(allProviders.map(async (providerId) => {
      const entries = await this.getProviderCacheEntries(app, providerId, library, currentProviders.includes(providerId));
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

  /**
   * Ensure the default mapped entry is persisted for providers that should survive provider-list changes.
   */
  static persistDefaultEntries(
    providerIds: string[],
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    let nextLibrary = { ...library };

    for (const providerId of this.uniqueProviderIds(providerIds)) {
      if (this.resolveLibraryProviderId(providerId, nextLibrary)) {
        continue;
      }

      const defaultEntry = this.getDefaultEntry(providerId);
      if (!defaultEntry) {
        continue;
      }

      nextLibrary = {
        ...nextLibrary,
        [providerId]: [defaultEntry],
      };
    }

    return nextLibrary;
  }

  static async addCustomIconSource(
    app: App,
    providerId: string,
    sourceInput: string,
    library: ProviderIconLibrary,
  ): Promise<ProviderIconLibrary> {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) {
      throw new Error('Provider ID is required.');
    }

    const storedProviderId = this.resolveLibraryProviderId(normalizedProviderId, library) ?? normalizedProviderId;
    const normalizedSource = this.normalizeCustomSource(sourceInput);
    const existingEntries = this.getEffectiveEntries(storedProviderId, library);
    if (existingEntries.some((entry) => entry.type !== 'mapped' && entry.source === normalizedSource.source)) {
      throw new Error('This icon source has already been added for the provider.');
    }

    const asset = await this.loadCustomSourceAsset(normalizedSource);
    const cacheFileName = this.buildCustomCacheFileName(normalizedProviderId, asset.mimeType);
    const entry: ProviderIconEntry = {
      id: this.createEntryId(),
      type: normalizedSource.type,
      source: normalizedSource.source,
      mimeType: asset.mimeType,
      cacheFileName,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.writeCachedAsset(app, normalizePath(`${ICON_CACHE_DIR}/${cacheFileName}`), asset.data);
    failedIconIds.delete(this.getEntryRuntimeKey(normalizedProviderId, entry));

    return {
      ...library,
      [storedProviderId]: [...existingEntries, entry],
    };
  }

  static splitCustomIconSourcesInput(sourceInput: string): string[] {
    const input = sourceInput.trim();
    if (!input) {
      return [];
    }

    const lineParts = input
      .split(/\r?\n/)
      .map((part) => part.trim().replace(/,\s*$/, '').trim())
      .filter(Boolean);

    return lineParts.flatMap((part) => this.splitCustomIconSourceChunk(part));
  }

  static updateProviderEntries(
    providerId: string,
    entries: ProviderIconEntry[],
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    const requestedProviderId = providerId.trim();
    if (!requestedProviderId) {
      return library;
    }
    const normalizedProviderId = this.resolveLibraryProviderId(requestedProviderId, library) ?? requestedProviderId;

    const sanitizedEntries = entries.filter((entry, index, collection) =>
      Boolean(entry.id)
      && Boolean(entry.source)
      && collection.findIndex((candidate) => candidate.id === entry.id) === index,
    );

    if (sanitizedEntries.length === 0) {
      const nextLibrary = { ...library };
      delete nextLibrary[normalizedProviderId];
      return nextLibrary;
    }

    return {
      ...library,
      [normalizedProviderId]: sanitizedEntries,
    };
  }

  static removeProviderEntry(
    providerId: string,
    entryId: string,
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    const resolvedProviderId = this.resolveLibraryProviderId(providerId, library) ?? providerId;
    const nextEntries = (library[resolvedProviderId] ?? []).filter((entry) => entry.id !== entryId);
    return this.updateProviderEntries(providerId, nextEntries, library);
  }

  static async clearCache(app: App): Promise<number> {
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

  /**
   * Preload icons for a set of providers into the local cache.
   */
  static async warmProviderIcons(
    app: App,
    providerIds: string[],
    library: ProviderIconLibrary = {},
  ): Promise<{ total: number; supported: number; cached: number; failed: number }> {
    const uniqueProviderIds = this.uniqueProviderIds(providerIds);

    let supported = 0;
    let cached = 0;
    let failed = 0;

    for (const providerId of uniqueProviderIds) {
      const entries = this.getEffectiveEntries(providerId, library);
      if (entries.length === 0) {
        continue;
      }

      supported += 1;
      const iconUrl = await this.resolveIconUrl(app, providerId, library, { retryFailed: true });
      if (iconUrl) {
        cached += 1;
      } else {
        failed += 1;
      }
    }

    logger.debug(
      `Warm provider icons complete: total=${uniqueProviderIds.length}, supported=${supported}, cached=${cached}, failed=${failed}`,
    );

    return {
      total: uniqueProviderIds.length,
      supported,
      cached,
      failed,
    };
  }
  
  /**
   * Create an img element with the provider icon
   */
  static createIconElement(providerId: string, size: number = 16): HTMLElement | null {
    const iconUrl = this.getIconUrl(providerId);
    if (!iconUrl) return null;
    
    const img = document.createElement('img');
    img.classList.add('opencodian-provider-icon-image');
    img.src = iconUrl;
    img.width = size;
    img.height = size;
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.objectFit = 'contain';
    img.alt = providerId;
    
    // Add error handler to fallback to default icon
    img.onerror = () => {
      logger.debug(`Failed to load icon for: ${providerId}`);
      img.style.display = 'none';
    };
    
    return img;
  }

  private static async getProviderCacheEntries(
    app: App,
    providerId: string,
    library: ProviderIconLibrary,
    isCurrentProvider: boolean,
  ): Promise<ProviderIconCacheEntry[]> {
    const entries = this.getEffectiveEntries(providerId, library);
    return Promise.all(entries.map(async (entry, index) => {
      const asset = await this.resolveEntryAsset(app, providerId, entry, { cacheOnly: true });
      return {
        providerId,
        entry,
        iconId: asset?.iconId ?? (
          entry.type === 'mapped'
            ? entry.source
            : entry.type === 'builtin'
              ? (parseBuiltinSource(entry.source)?.iconId ?? null)
              : null
        ),
        cached: asset?.cached ?? false,
        cachePath: asset?.cachePath ?? this.getCachePathForEntry(entry),
        iconUrl: asset?.iconUrl ?? this.getPreviewUrlForEntry(app, entry),
        isCurrentProvider,
        isSelected: index === 0,
        requestedVariant: asset?.requestedVariant ?? entry.variant,
        resolvedVariant: asset?.resolvedVariant,
        resolvedFormat: asset?.resolvedFormat,
        fallbackUsed: asset?.fallbackUsed ?? false,
        sourceLabel: asset?.sourceLabel ?? this.getEntrySourceLabel(entry),
      } satisfies ProviderIconCacheEntry;
    }));
  }

  private static getEffectiveEntries(
    providerId: string,
    library: ProviderIconLibrary,
  ): ProviderIconEntry[] {
    const resolvedProviderId = this.resolveLibraryProviderId(providerId, library);
    const savedEntries = resolvedProviderId ? (library[resolvedProviderId] ?? []) : [];
    if (savedEntries.length === 0) {
      const defaultEntry = this.getDefaultEntry(providerId);
      return defaultEntry ? [defaultEntry] : [];
    }

    const defaultEntry = this.getDefaultEntry(providerId);
    const hasEquivalentDefaultEntry = defaultEntry
      ? savedEntries.some((entry) => this.areEquivalentEntries(entry, defaultEntry))
      : false;
    if (!defaultEntry || hasEquivalentDefaultEntry) {
      return [...savedEntries];
    }

    return [...savedEntries, defaultEntry];
  }

  private static getDefaultEntry(providerId: string): ProviderIconEntry | null {
    const iconId = this.getIconId(providerId);
    if (!iconId) {
      const builtinMatch = resolveBuiltinIconMatch(providerId);
      return builtinMatch
        ? this.createBuiltinEntry(builtinMatch.libraryId, builtinMatch.iconId, false, 'auto')
        : null;
    }

    return {
      id: `mapped:${iconId}`,
      type: 'mapped',
      source: iconId,
      variant: 'auto',
      mimeType: 'image/svg+xml',
      addedAt: 0,
    };
  }

  private static async resolveEntryAsset(
    app: App,
    providerId: string,
    entry: ProviderIconEntry,
    options: ResolveIconUrlOptions & { cacheOnly?: boolean } = {},
  ): Promise<ResolvedProviderIconAsset | null> {
    const runtimeKey = this.getEntryRuntimeKey(providerId, entry);
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

    const loadPromise = this.loadEntryAsset(app, providerId, entry, options);
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

  private static async loadEntryAsset(
    app: App,
    providerId: string,
    entry: ProviderIconEntry,
    options: ResolveIconUrlOptions & { cacheOnly?: boolean },
  ): Promise<ResolvedProviderIconAsset | null> {
    const runtimeKey = this.getEntryRuntimeKey(providerId, entry);

    try {
      const asset = entry.type === 'mapped' || this.isLobehubBuiltinEntry(entry)
        ? await this.loadLobehubEntryAsset(app, providerId, entry, options.cacheOnly ?? false)
        : entry.type === 'builtin'
          ? await this.loadBundledBuiltinEntryAsset(app, providerId, entry, options.cacheOnly ?? false)
          : await this.loadCustomEntryAsset(app, providerId, entry, options.cacheOnly ?? false);

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

  private static async loadMappedAsset(iconId: string, providerId: string): Promise<LoadedIconAsset> {
    const remoteUrl = `${LOBEHUB_CDN_BASE}/${iconId}.svg`;
    return this.loadRemotePreviewAsset(remoteUrl, `HTTP error while fetching ${providerId}`);
  }

  private static async loadRemotePreviewAsset(url: string, errorPrefix?: string): Promise<LoadedIconAsset> {
    const response = await requestUrl({
      url,
      method: 'GET',
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(errorPrefix ?? `HTTP ${response.status} while fetching preview asset.`);
    }

    const mimeType = this.detectMimeType(response.arrayBuffer, response.headers['content-type'], url);
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new Error('Preview asset did not return a supported image.');
    }

    return {
      data: response.arrayBuffer,
      mimeType,
    };
  }

  private static async loadBuiltinAsset(
    app: App,
    source: string,
    providerId: string,
  ): Promise<LoadedIconAsset> {
    const parsed = parseBuiltinSource(source);
    if (!parsed) {
      throw new Error(`Invalid builtin icon source for ${providerId}.`);
    }

    if (parsed.libraryId === 'lobehub') {
      return this.loadMappedAsset(parsed.iconId, providerId);
    }

    return this.loadBundledOpencodeAsset(app, parsed.iconId, providerId);
  }

  private static async loadBundledOpencodeAsset(
    app: App,
    iconId: string,
    providerId: string,
  ): Promise<LoadedIconAsset> {
    const assetPath = this.getBundledOpencodeAssetPath(app, iconId);
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
      mimeType: this.detectMimeType(data, undefined, assetPath),
    };
  }

  private static async loadCustomSourceAsset(source: NormalizedCustomSource): Promise<LoadedIconAsset> {
    return source.type === 'url'
      ? this.loadRemoteCustomAsset(source.source)
      : this.loadLocalCustomAsset(source.localPath ?? source.source);
  }

  private static async loadRemoteCustomAsset(source: string): Promise<LoadedIconAsset> {
    const response = await requestUrl({
      url: source,
      method: 'GET',
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} while fetching custom icon.`);
    }

    this.assertByteLength(response.arrayBuffer.byteLength);
    const mimeType = this.detectMimeType(response.arrayBuffer, response.headers['content-type'], source);
    return {
      data: response.arrayBuffer,
      mimeType,
    };
  }

  private static async loadLocalCustomAsset(localPath: string): Promise<LoadedIconAsset> {
    const stats = await fs.promises.stat(localPath);
    if (!stats.isFile()) {
      throw new Error('The provided local icon path is not a file.');
    }

    this.assertByteLength(stats.size);
    const buffer = await fs.promises.readFile(localPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const mimeType = this.detectMimeType(arrayBuffer, undefined, localPath);
    return {
      data: arrayBuffer,
      mimeType,
    };
  }

  private static async loadLobehubEntryAsset(
    app: App,
    providerId: string,
    entry: ProviderIconEntry,
    cacheOnly: boolean,
  ): Promise<ResolvedProviderIconAsset | null> {
    const iconId = this.getLobehubIconId(entry);
    if (!iconId) {
      return null;
    }

    const candidateState = this.getPreviewUrlForLobehubIcon(iconId, entry.variant ?? 'auto');
    if (!candidateState) {
      return null;
    }

    for (const candidate of candidateState.candidates) {
      const cachedAsset = await this.readCachedAssetByPath(
        app,
        candidate.cachePath,
        this.getMimeTypeForResolvedFormat(candidate.format),
      );
      if (cachedAsset) {
        return {
          cachePath: candidate.cachePath,
          cached: true,
          fallbackUsed: candidate.fallbackUsed,
          iconId,
          iconUrl: this.assetToDataUrl(cachedAsset),
          requestedVariant: candidateState.requestedVariant,
          resolvedFormat: candidate.format,
          resolvedVariant: candidate.resolvedVariant,
          sourceLabel: this.getEntrySourceLabel(entry),
        };
      }

      if (cacheOnly) {
        continue;
      }

      try {
        const remoteAsset = await this.loadRemotePreviewAsset(candidate.remoteUrl);
        await this.writeCachedAsset(app, candidate.cachePath, remoteAsset.data);
        return {
          cachePath: candidate.cachePath,
          cached: false,
          fallbackUsed: candidate.fallbackUsed,
          iconId,
          iconUrl: this.assetToDataUrl(remoteAsset),
          requestedVariant: candidateState.requestedVariant,
          resolvedFormat: candidate.format,
          resolvedVariant: candidate.resolvedVariant,
          sourceLabel: this.getEntrySourceLabel(entry),
        };
      } catch {
        continue;
      }
    }

    if (!cacheOnly) {
      return null;
    }

    return {
      cachePath: candidateState.candidates[0]?.cachePath ?? null,
      cached: false,
      fallbackUsed: candidateState.candidates[0]?.fallbackUsed ?? false,
      iconId,
      iconUrl: candidateState.previewUrl,
      requestedVariant: candidateState.requestedVariant,
      resolvedFormat: candidateState.resolvedFormat,
      resolvedVariant: candidateState.resolvedVariant,
      sourceLabel: this.getEntrySourceLabel(entry),
    };
  }

  private static async loadBundledBuiltinEntryAsset(
    app: App,
    providerId: string,
    entry: ProviderIconEntry,
    cacheOnly: boolean,
  ): Promise<ResolvedProviderIconAsset | null> {
    const parsed = parseBuiltinSource(entry.source);
    if (!parsed) {
      return null;
    }

    const cachePath = this.getCachePathForEntry(entry);
    const cachedAsset = await this.readCachedAssetByPath(app, cachePath, 'image/svg+xml');
    if (cachedAsset) {
      return {
        cachePath,
        cached: true,
        fallbackUsed: false,
        iconId: parsed.iconId,
        iconUrl: this.assetToDataUrl(cachedAsset),
        requestedVariant: 'auto',
        resolvedFormat: 'svg',
        resolvedVariant: 'mono',
        sourceLabel: this.getEntrySourceLabel(entry),
      };
    }

    const previewUrl = this.getPreviewUrlForEntry(app, entry);
    if (cacheOnly) {
      return {
        cachePath,
        cached: false,
        fallbackUsed: false,
        iconId: parsed.iconId,
        iconUrl: previewUrl,
        requestedVariant: 'auto',
        resolvedFormat: 'svg',
        resolvedVariant: 'mono',
        sourceLabel: this.getEntrySourceLabel(entry),
      };
    }

    const asset = await this.loadBundledOpencodeAsset(app, parsed.iconId, providerId);
    await this.writeCachedAsset(app, cachePath, asset.data);
    return {
      cachePath,
      cached: false,
      fallbackUsed: false,
      iconId: parsed.iconId,
      iconUrl: this.assetToDataUrl(asset),
      requestedVariant: 'auto',
      resolvedFormat: 'svg',
      resolvedVariant: 'mono',
      sourceLabel: this.getEntrySourceLabel(entry),
    };
  }

  private static async loadCustomEntryAsset(
    app: App,
    providerId: string,
    entry: ProviderIconEntry,
    cacheOnly: boolean,
  ): Promise<ResolvedProviderIconAsset | null> {
    const cachePath = this.getCachePathForEntry(entry);
    const cachedAsset = await this.readCachedAsset(app, entry);
    if (cachedAsset) {
      return {
        cachePath,
        cached: true,
        fallbackUsed: false,
        iconId: null,
        iconUrl: this.assetToDataUrl(cachedAsset),
        resolvedFormat: this.getResolvedFormatForMimeType(cachedAsset.mimeType),
        sourceLabel: this.getEntrySourceLabel(entry),
      };
    }

    const previewUrl = this.getPreviewUrlForEntry(app, entry);
    if (cacheOnly) {
      return {
        cachePath,
        cached: false,
        fallbackUsed: false,
        iconId: null,
        iconUrl: previewUrl,
        resolvedFormat: this.getResolvedFormatForMimeType(entry.mimeType),
        sourceLabel: this.getEntrySourceLabel(entry),
      };
    }

    const asset = await this.loadCustomSourceAsset(
      this.normalizeCustomSource(entry.source, entry.type === 'file' ? 'file' : 'url'),
    );
    await this.writeCachedAsset(app, cachePath, asset.data);
    return {
      cachePath,
      cached: false,
      fallbackUsed: false,
      iconId: null,
      iconUrl: this.assetToDataUrl(asset),
      resolvedFormat: this.getResolvedFormatForMimeType(asset.mimeType),
      sourceLabel: this.getEntrySourceLabel(entry),
    };
  }

  private static async readCachedAssetByPath(
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
        mimeType: fallbackMimeType ?? this.getMimeTypeFromPath(cachePath) ?? 'image/svg+xml',
      };
    } catch (error) {
      logger.debug(`Failed to read cached icon: ${cachePath}`, error);
      return null;
    }
  }

  private static async readCachedAsset(app: App, entry: ProviderIconEntry): Promise<LoadedIconAsset | null> {
    const cachePath = this.getCachePathForEntry(entry);
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
        mimeType: entry.mimeType ?? this.getMimeTypeFromPath(cachePath) ?? 'image/svg+xml',
      };
    } catch (error) {
      logger.debug(`Failed to read cached icon: ${cachePath}`, error);
      return null;
    }
  }

  private static async writeCachedAsset(app: App, cachePath: string | null, data: ArrayBuffer): Promise<void> {
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

  private static normalizeCustomSource(
    sourceInput: string,
    expectedType?: 'url' | 'file',
  ): NormalizedCustomSource {
    const source = this.stripEnclosingQuotes(sourceInput.trim());
    if (!source) {
      throw new Error('Please paste a non-empty local path or URL.');
    }

    if (source.length > 2048) {
      throw new Error('The icon source is too long.');
    }

    if (this.isAbsoluteLocalPath(source)) {
      if (expectedType && expectedType !== 'file') {
        throw new Error('Expected a URL, but received a local file path.');
      }

      return { type: 'file', source, localPath: source };
    }

    const maybeUrl = this.tryParseUrl(source);
    if (maybeUrl) {
      if (maybeUrl.protocol === 'http:' || maybeUrl.protocol === 'https:') {
        if (expectedType && expectedType !== 'url') {
          throw new Error('Expected a local file path, but received a URL.');
        }
        return { type: 'url', source: maybeUrl.toString() };
      }

      if (maybeUrl.protocol === 'file:') {
        if (expectedType && expectedType !== 'file') {
          throw new Error('Expected a URL, but received a local file path.');
        }
        return { type: 'file', source: maybeUrl.toString(), localPath: decodeURIComponent(maybeUrl.pathname.replace(/^\/([A-Za-z]:)/, '$1')) };
      }

      throw new Error('Only http(s) URLs and local file paths are allowed.');
    }

    if (!this.isAbsoluteLocalPath(source)) {
      throw new Error('Please use an absolute local file path or a full URL.');
    }

    if (expectedType && expectedType !== 'file') {
      throw new Error('Expected a URL, but received a local file path.');
    }

    return { type: 'file', source, localPath: source };
  }

  private static splitCustomIconSourceChunk(chunk: string): string[] {
    const normalizedChunk = chunk.trim();
    if (!normalizedChunk) {
      return [];
    }

    const commaParts = normalizedChunk
      .split(/\s*,\s*(?=(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/]|\/))/)
      .map((part) => part.trim())
      .filter(Boolean);

    return commaParts.flatMap((part) => this.splitWhitespaceSeparatedUrls(part));
  }

  private static splitWhitespaceSeparatedUrls(chunk: string): string[] {
    const tokens = chunk
      .split(/\s+/)
      .map((part) => part.trim().replace(/,\s*$/, ''))
      .filter(Boolean);

    if (tokens.length > 1 && tokens.every((token) => this.isUrlLikeCustomSource(token))) {
      return tokens;
    }

    return [chunk.replace(/,\s*$/, '').trim()];
  }

  private static isUrlLikeCustomSource(sourceInput: string): boolean {
    const source = this.stripEnclosingQuotes(sourceInput.trim());
    if (!source) {
      return false;
    }

    const maybeUrl = this.tryParseUrl(source);
    return Boolean(
      maybeUrl && (
        maybeUrl.protocol === 'http:'
        || maybeUrl.protocol === 'https:'
        || maybeUrl.protocol === 'file:'
      ),
    );
  }

  private static tryParseUrl(source: string): URL | null {
    try {
      return new URL(source);
    } catch {
      return null;
    }
  }

  private static isAbsoluteLocalPath(source: string): boolean {
    return path.isAbsolute(source) || /^[A-Za-z]:[\\/]/.test(source);
  }

  private static detectMimeType(buffer: ArrayBuffer, headerValue?: string, sourceHint?: string): string {
    const normalizedHeader = headerValue?.split(';')[0]?.trim().toLowerCase();
    if (normalizedHeader && ALLOWED_IMAGE_MIME_TYPES.has(normalizedHeader)) {
      return normalizedHeader;
    }

    const bytes = new Uint8Array(buffer);
    const prefix = Buffer.from(bytes.slice(0, Math.min(bytes.length, 2048)))
      .toString('utf-8')
      .replace(/^\uFEFF/, '')
      .trimStart();
    if (/<svg[\s>]/i.test(prefix) || (/^<\?xml/i.test(prefix) && /\.svg$/i.test(sourceHint ?? ''))) {
      return 'image/svg+xml';
    }

    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }

    if (bytes.length >= 6) {
      const signature = Buffer.from(bytes.slice(0, 6)).toString('ascii');
      if (signature === 'GIF87a' || signature === 'GIF89a') {
        return 'image/gif';
      }
    }

    if (bytes.length >= 12) {
      const riff = Buffer.from(bytes.slice(0, 4)).toString('ascii');
      const webp = Buffer.from(bytes.slice(8, 12)).toString('ascii');
      if (riff === 'RIFF' && webp === 'WEBP') {
        return 'image/webp';
      }
    }

    const fromPath = this.getMimeTypeFromPath(sourceHint);
    if (fromPath) {
      return fromPath;
    }

    throw new Error('Only SVG, PNG, JPEG, WEBP, and GIF icon files are supported.');
  }

  private static getMimeTypeFromPath(sourceHint?: string): string | null {
    if (!sourceHint) {
      return null;
    }

    const extension = path.extname(sourceHint).toLowerCase();
    switch (extension) {
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      default:
        return null;
    }
  }

  private static buildCustomCacheFileName(providerId: string, mimeType: string): string {
    const extension = MIME_TYPE_TO_EXTENSION[mimeType];
    const safeProvider = providerId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 48) || 'provider';
    return `${safeProvider}-${this.createEntryId()}.${extension}`;
  }

  private static createEntryId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private static getCachePathForEntry(entry: ProviderIconEntry): string | null {
    if (entry.type === 'mapped' || this.isLobehubBuiltinEntry(entry)) {
      const iconId = this.getLobehubIconId(entry);
      if (!iconId) {
        return null;
      }

      return this.getPreviewUrlForLobehubIcon(iconId, entry.variant ?? 'auto')?.candidates[0]?.cachePath ?? null;
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

  private static getEntryRuntimeKey(providerId: string, entry: ProviderIconEntry): string {
    if (!this.isLobehubBackedEntry(entry)) {
      return `${providerId}::${entry.id}`;
    }

    const requestedVariant = entry.variant ?? 'auto';
    const activeVariant = this.getActiveDefaultVariant();
    const themeKey = this.getActiveThemeVariant();
    const colorMode = this.getActiveColorMode();
    return `${providerId}::${entry.id}::${requestedVariant}::${activeVariant}::${colorMode}::${themeKey}`;
  }

  private static assetToDataUrl(asset: LoadedIconAsset): string {
    const base64 = Buffer.from(asset.data).toString('base64');
    return `data:${asset.mimeType};base64,${base64}`;
  }

  private static getEntrySourceLabel(entry: ProviderIconEntry): string {
    if (entry.type === 'mapped') {
      return `LobeHub / ${entry.source}`;
    }

    if (entry.type === 'builtin') {
      const builtinIcon = findBuiltinIcon(entry.source);
      if (!builtinIcon) {
        return entry.source;
      }

      return `${builtinIcon.libraryId === 'lobehub' ? 'LobeHub' : 'OpenCode'} / ${builtinIcon.iconId}`;
    }

    return entry.source;
  }

  private static getPreviewUrlForEntry(app: App, entry: ProviderIconEntry): string | null {
    if (entry.type === 'mapped') {
      return this.getPreviewUrlForLobehubIcon(entry.source, entry.variant ?? 'auto')?.previewUrl ?? null;
    }

    if (entry.type === 'builtin') {
      const parsed = parseBuiltinSource(entry.source);
      if (!parsed) {
        return null;
      }

      return this.getBuiltinPreview(app, findBuiltinIcon(entry.source) ?? {
        libraryId: parsed.libraryId,
        iconId: parsed.iconId,
        displayName: parsed.iconId,
        aliases: [],
        normalizedAliases: [],
        tokens: [],
        searchText: parsed.iconId,
        source: entry.source,
      }, entry.variant ?? 'auto').previewUrl;
    }

    if (entry.type === 'url') {
      return entry.source;
    }

    return null;
  }

  private static getBuiltinPreviewUrl(
    app: App,
    libraryId: BuiltinIconLibraryId,
    iconId: string,
    requestedVariant: LobehubIconVariant = 'auto',
  ): string | null {
    const candidates = this.getBuiltinPreviewCandidates(app, libraryId, iconId, requestedVariant);
    return candidates[0] ?? null;
  }

  static getBuiltinPreviewCandidates(
    app: App,
    libraryId: BuiltinIconLibraryId,
    iconId: string,
    requestedVariant: LobehubIconVariant = 'auto',
  ): string[] {
    if (libraryId === 'lobehub') {
      return this.getPreviewUrlForLobehubIcon(iconId, requestedVariant)?.previewCandidates ?? [];
    }

    const adapter = app.vault.adapter;
    if (typeof adapter.getResourcePath !== 'function') {
      return [];
    }

    return [adapter.getResourcePath(this.getBundledOpencodeAssetPath(app, iconId))];
  }

  private static isDefinitionAvailableForVariant(
    definition: BuiltinIconDefinition,
    requestedVariant: LobehubIconVariant,
  ): boolean {
    if (definition.libraryId !== 'lobehub') {
      return true;
    }

    if (requestedVariant === 'auto') {
      return true;
    }

    return definition.lobehub?.supportedVariants.includes(requestedVariant) ?? false;
  }

  private static getBuiltinPreview(
    app: App,
    definition: BuiltinIconDefinition,
    requestedVariant: LobehubIconVariant,
  ): {
    previewCandidates: string[];
    previewUrl: string | null;
    resolvedFormat?: ProviderIconResolvedFormat;
    resolvedVariant?: ResolvedLobehubVariant;
  } {
    if (definition.libraryId === 'lobehub') {
      const preview = this.getPreviewUrlForLobehubIcon(definition.iconId, requestedVariant);
      return {
        previewCandidates: preview?.previewCandidates ?? [],
        previewUrl: preview?.previewUrl ?? null,
        resolvedFormat: preview?.resolvedFormat,
        resolvedVariant: preview?.resolvedVariant,
      };
    }

    return {
      previewCandidates: this.getBuiltinPreviewCandidates(app, definition.libraryId, definition.iconId, requestedVariant),
      previewUrl: this.getBuiltinPreviewUrl(app, definition.libraryId, definition.iconId, requestedVariant),
      resolvedFormat: 'svg',
      resolvedVariant: 'mono',
    };
  }

  private static getPreviewUrlForLobehubIcon(iconId: string, requestedVariant: LobehubIconVariant): {
    candidates: Array<{
      cachePath: string;
      fallbackUsed: boolean;
      format: ProviderIconResolvedFormat;
      remoteUrl: string;
      resolvedVariant: ResolvedLobehubVariant;
    }>;
    previewCandidates: string[];
    previewUrl: string | null;
    requestedVariant: LobehubIconVariant;
    resolvedFormat?: ProviderIconResolvedFormat;
    resolvedVariant?: ResolvedLobehubVariant;
  } | null {
    const manifestEntry = this.getLobehubManifestEntry(iconId);
    if (!manifestEntry) {
      return null;
    }

    const candidateVariants = this.getLobehubCandidateVariants(requestedVariant);
    const themeKey = this.getActiveThemeVariant();
    const candidates = candidateVariants.flatMap((variant, index) => {
      const variantEntry = manifestEntry.variants[variant];
      if (!variantEntry?.staticSupport) {
        return [];
      }

      const format: ProviderIconResolvedFormat = variant === 'avatar' ? 'avatar' : 'svg';
      const remoteUrl = this.getManifestVariantUrl(variantEntry, format, themeKey);
      if (!remoteUrl) {
        return [];
      }

      return [{
        cachePath: this.getLobehubCachePath({
          iconId,
          requestedVariant,
          resolvedVariant: variant,
          format,
          themeKey,
        }),
        fallbackUsed: index > 0,
        format,
        remoteUrl,
        resolvedVariant: variant,
      }];
    });

    if (candidates.length === 0) {
      return null;
    }

    return {
      candidates,
      previewCandidates: candidates.map((candidate) => candidate.remoteUrl),
      previewUrl: candidates[0]?.remoteUrl ?? null,
      requestedVariant,
      resolvedFormat: candidates[0]?.format,
      resolvedVariant: candidates[0]?.resolvedVariant,
    };
  }

  private static getLobehubManifestEntry(iconId: string): LobehubManifestEntry | null {
    return LOBEHUB_MANIFEST_BY_ICON_ID.get(iconId) ?? LOBEHUB_MANIFEST_BY_ICON_ID.get(iconId.toLowerCase()) ?? null;
  }

  private static getLobehubCandidateVariants(requestedVariant: LobehubIconVariant): ResolvedLobehubVariant[] {
    const orderedVariants: ResolvedLobehubVariant[] = [];
    const seen = new Set<ResolvedLobehubVariant>();

    const pushVariant = (variant: LobehubIconVariant): void => {
      if (variant === 'auto' || variant === 'combine' || seen.has(variant)) {
        return;
      }

      seen.add(variant);
      orderedVariants.push(variant);
    };

    const pushVariants = (variants: LobehubIconVariant[]): void => {
      for (const variant of variants) {
        pushVariant(variant);
      }
    };

    if (requestedVariant !== 'auto') {
      pushVariants(this.getFallbackVariantSequence(requestedVariant));
    } else {
      const globalVariant = this.getActiveDefaultVariant();
      if (globalVariant !== 'auto') {
        pushVariants(this.getFallbackVariantSequence(globalVariant));
      }

      pushVariants(this.getColorModeVariantSequence(this.getActiveColorMode()));
    }

    pushVariants(['mono', 'color', 'brand-color', 'brand', 'text-color', 'text', 'text-cn', 'avatar']);
    return orderedVariants;
  }

  private static getFallbackVariantSequence(requestedVariant: LobehubIconVariant): LobehubIconVariant[] {
    switch (requestedVariant) {
      case 'mono':
        return ['mono', 'brand', 'brand-color', 'color', 'avatar', 'text', 'text-color', 'text-cn'];
      case 'color':
        return ['color', 'brand-color', 'brand', 'mono', 'avatar', 'text-color', 'text', 'text-cn'];
      case 'brand':
        return ['brand', 'brand-color', 'color', 'mono', 'avatar', 'text-color', 'text', 'text-cn'];
      case 'brand-color':
        return ['brand-color', 'color', 'brand', 'mono', 'avatar', 'text-color', 'text', 'text-cn'];
      case 'text':
        return ['text', 'text-color', 'text-cn', 'mono', 'brand-color', 'color', 'brand', 'avatar'];
      case 'text-cn':
        return ['text-cn', 'text', 'text-color', 'mono', 'brand-color', 'color', 'brand', 'avatar'];
      case 'text-color':
        return ['text-color', 'text', 'text-cn', 'mono', 'brand-color', 'color', 'brand', 'avatar'];
      case 'avatar':
        return ['avatar', 'color', 'brand-color', 'brand', 'mono', 'text-color', 'text', 'text-cn'];
      case 'combine':
        return ['brand-color', 'color', 'brand', 'mono', 'avatar', 'text-color', 'text', 'text-cn'];
      case 'auto':
      default:
        return ['mono'];
    }
  }

  private static getColorModeVariantSequence(colorMode: ProviderIconColorMode): LobehubIconVariant[] {
    switch (colorMode) {
      case 'color':
        return ['color', 'brand-color', 'brand', 'mono', 'avatar', 'text-color', 'text', 'text-cn'];
      case 'monochrome':
      case 'system':
      default:
        return ['mono', 'brand', 'brand-color', 'color', 'avatar', 'text', 'text-color', 'text-cn'];
    }
  }

  private static getManifestVariantUrl(
    variantEntry: LobehubManifestEntry['variants'][Exclude<keyof LobehubManifestEntry['variants'], 'auto'>],
    format: ProviderIconResolvedFormat,
    themeKey: 'light' | 'dark',
  ): string | null {
    if (!variantEntry) {
      return null;
    }

    switch (format) {
      case 'svg':
        return variantEntry.urls.svg ?? null;
      case 'png':
        return variantEntry.urls.png?.[themeKey] ?? null;
      case 'webp':
        return variantEntry.urls.webp?.[themeKey] ?? null;
      case 'avatar':
        return variantEntry.urls.avatar ?? null;
      default:
        return null;
    }
  }

  private static getLobehubCachePath({
    iconId,
    requestedVariant,
    resolvedVariant,
    format,
    themeKey,
  }: LobehubCachePathOptions): string {
    const safeIconId = iconId.replace(/[^a-z0-9_-]/gi, '-');
    const extension = format === 'avatar' ? 'webp' : format;
    return normalizePath(
      `${ICON_CACHE_DIR}/lobehub-${safeIconId}-${requestedVariant}-${resolvedVariant}-${themeKey}-${format}.${extension}`,
    );
  }

  private static getMimeTypeForResolvedFormat(format: ProviderIconResolvedFormat): string {
    switch (format) {
      case 'svg':
        return 'image/svg+xml';
      case 'png':
        return 'image/png';
      case 'webp':
      case 'avatar':
      default:
        return 'image/webp';
    }
  }

  private static getResolvedFormatForMimeType(mimeType?: string): ProviderIconResolvedFormat | undefined {
    switch (mimeType) {
      case 'image/svg+xml':
        return 'svg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return undefined;
    }
  }

  private static isLobehubBuiltinEntry(entry: ProviderIconEntry): boolean {
    return entry.type === 'builtin' && parseBuiltinSource(entry.source)?.libraryId === 'lobehub';
  }

  private static isLobehubBackedEntry(entry: ProviderIconEntry): boolean {
    if (entry.type === 'mapped') {
      return true;
    }

    if (entry.type !== 'builtin') {
      return false;
    }

    return parseBuiltinSource(entry.source)?.libraryId === 'lobehub';
  }

  private static getLobehubIconId(entry: ProviderIconEntry): string | null {
    if (entry.type === 'mapped') {
      return entry.source;
    }

    if (entry.type !== 'builtin') {
      return null;
    }

    const parsed = parseBuiltinSource(entry.source);
    return parsed?.libraryId === 'lobehub' ? parsed.iconId : null;
  }

  private static getActiveColorMode(): ProviderIconColorMode {
    const value = document.body.dataset.opencodianProviderIconMode;
    return value === 'color' || value === 'monochrome' || value === 'system'
      ? value
      : 'system';
  }

  private static getActiveDefaultVariant(): LobehubIconVariant {
    const value = document.body.dataset.opencodianProviderIconVariant;
    return ALL_VARIANT_OPTIONS.includes(value as LobehubIconVariant)
      ? value as LobehubIconVariant
      : 'auto';
  }

  private static getActiveThemeVariant(): 'light' | 'dark' {
    return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
  }

  private static getBundledOpencodeAssetPath(app: App, iconId: string): string {
    const configDir = typeof (app.vault as { configDir?: string }).configDir === 'string'
      ? (app.vault as { configDir?: string }).configDir
      : null;
    const resolvedConfigDir = configDir && configDir.trim().length > 0
      ? configDir.trim()
      : '.obsidian';
    return normalizePath(`${resolvedConfigDir}/plugins/opencodian/assets/provider-icons/opencode/${iconId}.svg`);
  }

  private static createBuiltinEntry(
    libraryId: BuiltinIconLibraryId,
    iconId: string,
    persisted: boolean = true,
    variant: LobehubIconVariant = 'auto',
  ): ProviderIconEntry {
    const source = formatBuiltinSource(libraryId, iconId);
    return {
      id: `builtin:${source}`,
      type: 'builtin',
      source,
      variant: libraryId === 'lobehub' ? variant : 'auto',
      mimeType: 'image/svg+xml',
      addedAt: persisted ? Date.now() : 0,
      updatedAt: persisted ? Date.now() : undefined,
    };
  }

  private static areEquivalentEntries(left: ProviderIconEntry, right: ProviderIconEntry): boolean {
    if (left.type === right.type && left.source === right.source) {
      return true;
    }

    const leftBuiltin = left.type === 'builtin'
      ? parseBuiltinSource(left.source)
      : left.type === 'mapped'
        ? { libraryId: 'lobehub' as const, iconId: left.source }
        : null;
    const rightBuiltin = right.type === 'builtin'
      ? parseBuiltinSource(right.source)
      : right.type === 'mapped'
        ? { libraryId: 'lobehub' as const, iconId: right.source }
        : null;

    return Boolean(
      leftBuiltin
      && rightBuiltin
      && leftBuiltin.libraryId === rightBuiltin.libraryId
      && leftBuiltin.iconId === rightBuiltin.iconId,
    );
  }

  private static getEditableEntriesForProvider(
    providerId: string,
    library: ProviderIconLibrary,
  ): ProviderIconEntry[] {
    const currentEntries = library[providerId];
    if (currentEntries?.length) {
      return [...currentEntries];
    }

    const defaultEntry = this.getDefaultEntry(providerId);
    return defaultEntry ? [defaultEntry] : [];
  }

  private static getRecommendedBuiltinIcons(
    providerId: string,
    libraryId?: BuiltinIconLibraryId,
  ): BuiltinIconDefinition[] {
    const primary = resolveBuiltinIconMatch(providerId);
    const fallback = searchBuiltinIcons(providerId, {
      libraryId,
      limit: 12,
    });

    return [
      ...(primary ? [primary] : []),
      ...fallback,
    ].filter((definition, index, collection) => {
      if (libraryId && definition.libraryId !== libraryId) {
        return false;
      }

      return collection.findIndex((candidate) => candidate.source === definition.source) === index;
    });
  }

  private static uniqueProviderIds(providerIds: string[]): string[] {
    return Array.from(new Set(
      providerIds
        .map((providerId) => providerId.trim())
        .filter(Boolean),
    ));
  }

  private static mergeProviderIds(currentProviderIds: string[], savedProviderIds: string[]): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();

    for (const providerId of [...currentProviderIds, ...savedProviderIds]) {
      const trimmedProviderId = providerId.trim();
      if (!trimmedProviderId) {
        continue;
      }

      const canonicalKey = this.getCanonicalProviderKey(trimmedProviderId);
      if (seen.has(canonicalKey)) {
        continue;
      }

      seen.add(canonicalKey);
      merged.push(trimmedProviderId);
    }

    return merged;
  }

  private static resolveLibraryProviderId(
    providerId: string,
    library: ProviderIconLibrary,
  ): string | null {
    const trimmedProviderId = providerId.trim();
    if (!trimmedProviderId) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(library, trimmedProviderId)) {
      return trimmedProviderId;
    }

    const canonicalKey = this.getCanonicalProviderKey(trimmedProviderId);
    for (const savedProviderId of Object.keys(library)) {
      if (this.getCanonicalProviderKey(savedProviderId) === canonicalKey) {
        return savedProviderId;
      }
    }

    return null;
  }

  private static getCanonicalProviderKey(providerId: string): string {
    return providerId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private static stripEnclosingQuotes(source: string): string {
    if (source.length >= 2) {
      const firstChar = source[0];
      const lastChar = source[source.length - 1];
      if ((firstChar === '"' && lastChar === '"') || (firstChar === '\'' && lastChar === '\'')) {
        return source.slice(1, -1).trim();
      }
    }

    return source;
  }

  private static assertByteLength(byteLength: number): void {
    if (byteLength > MAX_ICON_BYTES) {
      throw new Error('The icon file is too large. Maximum size is 1 MB.');
    }
  }
}
