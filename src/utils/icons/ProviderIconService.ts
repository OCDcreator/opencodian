/**
 * Provider Icon Service
 *
 * Uses Lobehub Icons (https://lobehub.com/icons) CDN for provider logos
 * CDN URL: https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{id}.svg
 */

import type { App } from 'obsidian';

import type {
  LobehubIconVariant,
  ProviderIconLibrary,
} from '../../core/types';
import { createLogger } from '../../shared';
import {
  clearProviderIconCache,
  getProviderIconCacheState,
  ICON_CACHE_DIR,
  type ProviderIconCacheSummary,
  type ProviderIconProviderState,
  type ResolveIconUrlOptions,
  resolveProviderIconUrl,
  warmProviderIcons as warmCachedProviderIcons,
  writeProviderIconCacheAsset,
} from './providerIconAssetCache';
import {
  type BuiltinIconOption,
  getBuiltinPreviewCandidates,
  getPreviewUrlForLobehubIcon,
  getSelectedBuiltinSource,
  getSelectedBuiltinVariant,
  listBuiltinIconOptions,
  selectBuiltinIcon,
  type SelectBuiltinIconRequest,
} from './providerIconBuiltinSelection';
import {
  createCachedCustomEntry,
  normalizeCustomSource,
  splitCustomIconSourcesInput,
} from './providerIconCustomSources';
import {
  getEffectiveProviderEntries,
  getProviderIconId,
  hasProviderIcon,
  persistDefaultProviderEntries,
  removeProviderEntry as removeStoredProviderEntry,
  resolveProviderEntryResolution,
  updateProviderEntries as updateStoredProviderEntries,
} from './providerIconEntryResolution';

export type {
  ProviderIconCacheEntry,
  ProviderIconCacheSummary,
  ProviderIconProviderState,
} from './providerIconAssetCache';
export type { BuiltinIconOption } from './providerIconBuiltinSelection';

const logger = createLogger('ProviderIconService');

export class ProviderIconService {
  static getIconUrl(providerId: string): string | null {
    const iconId = this.getIconId(providerId);
    if (!iconId) {
      return null;
    }

    return getPreviewUrlForLobehubIcon(iconId, 'auto')?.previewUrl ?? null;
  }

  static async resolveIconUrl(
    app: App,
    providerId: string,
    library: ProviderIconLibrary = {},
    options: ResolveIconUrlOptions = {},
  ): Promise<string | null> {
    return resolveProviderIconUrl(app, providerId, library, options);
  }

  static getIconId(providerId: string): string | null {
    return getProviderIconId(providerId);
  }

  static hasIcon(providerId: string): boolean {
    return hasProviderIcon(providerId);
  }

  static listBuiltinIconOptions(
    app: App,
    providerId: string,
    library: ProviderIconLibrary = {},
    options: {
      query?: string;
      libraryId?: SelectBuiltinIconRequest['libraryId'];
      requestedVariant?: LobehubIconVariant;
    } = {},
  ): BuiltinIconOption[] {
    return listBuiltinIconOptions(app, providerId, library, options);
  }

  static selectBuiltinIcon(request: SelectBuiltinIconRequest): ProviderIconLibrary {
    return selectBuiltinIcon(request);
  }

  static getSelectedBuiltinSource(providerId: string, library: ProviderIconLibrary = {}): string | null {
    return getSelectedBuiltinSource(providerId, library);
  }

  static getSelectedBuiltinVariant(providerId: string, library: ProviderIconLibrary = {}): LobehubIconVariant {
    return getSelectedBuiltinVariant(providerId, library);
  }

  static async getProviderCacheState(
    app: App,
    currentProviderIds: string[],
    library: ProviderIconLibrary = {},
  ): Promise<{ providers: ProviderIconProviderState[]; summary: ProviderIconCacheSummary }> {
    return getProviderIconCacheState(app, currentProviderIds, library);
  }

  static persistDefaultEntries(
    providerIds: string[],
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    return persistDefaultProviderEntries(providerIds, library);
  }

  static async addCustomIconSource(
    app: App,
    providerId: string,
    sourceInput: string,
    library: ProviderIconLibrary,
  ): Promise<ProviderIconLibrary> {
    const resolution = resolveProviderEntryResolution(providerId, library);
    if (!resolution) {
      throw new Error('Provider ID is required.');
    }

    const normalizedSource = normalizeCustomSource(sourceInput);
    const existingEntries = getEffectiveProviderEntries(resolution.storageProviderId, library);
    if (existingEntries.some((entry) => entry.type !== 'mapped' && entry.source === normalizedSource.source)) {
      throw new Error('This icon source has already been added for the provider.');
    }

    const entry = await createCachedCustomEntry(
      resolution.requestedProviderId,
      normalizedSource,
      {
        cacheDirectory: ICON_CACHE_DIR,
        writeCachedAsset: (cachePath, data) => writeProviderIconCacheAsset(app, cachePath, data),
      },
    );

    return {
      ...library,
      [resolution.storageProviderId]: [...existingEntries, entry],
    };
  }

  static splitCustomIconSourcesInput(sourceInput: string): string[] {
    return splitCustomIconSourcesInput(sourceInput);
  }

  static updateProviderEntries(
    providerId: string,
    entries: Parameters<typeof updateStoredProviderEntries>[1],
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    return updateStoredProviderEntries(providerId, entries, library);
  }

  static removeProviderEntry(
    providerId: string,
    entryId: string,
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    return removeStoredProviderEntry(providerId, entryId, library);
  }

  static async clearCache(app: App): Promise<number> {
    return clearProviderIconCache(app);
  }

  static async warmProviderIcons(
    app: App,
    providerIds: string[],
    library: ProviderIconLibrary = {},
  ): Promise<{ total: number; supported: number; cached: number; failed: number }> {
    return warmCachedProviderIcons(app, providerIds, library);
  }

  static createIconElement(providerId: string, size: number = 16): HTMLElement | null {
    const iconUrl = this.getIconUrl(providerId);
    if (!iconUrl) {
      return null;
    }

    const img = document.createElement('img');
    img.classList.add('opencodian-provider-icon-image');
    img.src = iconUrl;
    img.width = size;
    img.height = size;
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.objectFit = 'contain';
    img.alt = providerId;
    img.onerror = () => {
      logger.debug(`Failed to load icon for: ${providerId}`);
      img.style.display = 'none';
    };

    return img;
  }

  static getBuiltinPreviewCandidates(
    app: App,
    libraryId: SelectBuiltinIconRequest['libraryId'],
    iconId: string,
    requestedVariant: LobehubIconVariant = 'auto',
  ): string[] {
    return getBuiltinPreviewCandidates(app, libraryId, iconId, requestedVariant);
  }
}
