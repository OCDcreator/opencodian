/* eslint-disable max-lines */

import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';

import type {
  LobehubIconVariant,
  ProviderIconColorMode,
  ProviderIconEntry,
  ProviderIconLibrary,
  ProviderIconResolvedFormat,
} from '../../core/types';
import {
  type BuiltinIconDefinition,
  type BuiltinIconLibraryId,
  findBuiltinIcon,
  formatBuiltinSource,
  getBuiltinIcon,
  parseBuiltinSource,
  resolveBuiltinIconMatch,
  searchBuiltinIcons,
} from './builtinIconRegistry';
import {
  LOBEHUB_ICON_MANIFEST,
  type LobehubManifestEntry,
} from './lobehubIconManifest';
import {
  areEquivalentProviderIconEntries,
  createBuiltinEntry,
  resolveProviderEntryResolution,
  updateProviderEntries,
} from './providerIconEntryResolution';
import type {
  BuiltinIconOption,
  LobehubIconPreviewState,
  ResolvedLobehubVariant,
  SelectBuiltinIconRequest,
} from './providerIconTypes';

export type {
  BuiltinIconOption,
  LobehubIconPreviewState,
  ResolvedLobehubVariant,
  SelectBuiltinIconRequest,
} from './providerIconTypes';

interface LobehubCachePathOptions {
  cacheDirectory: string;
  iconId: string;
  requestedVariant: LobehubIconVariant;
  resolvedVariant: ResolvedLobehubVariant;
  format: ProviderIconResolvedFormat;
  themeKey: 'light' | 'dark';
}

const LOBEHUB_MANIFEST_BY_ICON_ID = new Map(LOBEHUB_ICON_MANIFEST.map((entry) => [entry.iconId, entry]));
const DEFAULT_ICON_CACHE_DIR = '.opencodian/provider-icons';
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

export function listBuiltinIconOptions(
  app: App,
  providerId: string,
  library: ProviderIconLibrary = {},
  options: {
    query?: string;
    libraryId?: BuiltinIconLibraryId;
    requestedVariant?: LobehubIconVariant;
  } = {},
): BuiltinIconOption[] {
  const currentSource = getSelectedBuiltinSource(providerId, library);
  const selectedVariant = getSelectedBuiltinVariant(providerId, library);
  const requestedVariant = options.requestedVariant ?? selectedVariant;
  const recommended = getRecommendedBuiltinIcons(providerId, options.libraryId);
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
    .filter((definition) => isDefinitionAvailableForVariant(definition, requestedVariant))
    .map((definition) => {
      const preview = getBuiltinPreview(app, definition, requestedVariant);
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

export function selectBuiltinIcon({
  providerId,
  libraryId,
  iconId,
  library,
  variant = 'auto',
}: SelectBuiltinIconRequest): ProviderIconLibrary {
  const builtinDefinition = getBuiltinIcon(libraryId, iconId);
  if (!builtinDefinition) {
    return library;
  }

  const resolution = resolveProviderEntryResolution(providerId, library);
  if (!resolution) {
    return library;
  }

  const selectedEntry = createBuiltinEntry(
    libraryId,
    iconId,
    true,
    libraryId === 'lobehub' ? variant : 'auto',
  );

  const dedupedEntries = resolution.editableEntries.filter(
    (entry) => !areEquivalentProviderIconEntries(entry, selectedEntry),
  );
  return updateProviderEntries(
    resolution.storageProviderId,
    [selectedEntry, ...dedupedEntries],
    library,
  );
}

export function getSelectedBuiltinSource(providerId: string, library: ProviderIconLibrary = {}): string | null {
  const selectedEntry = resolveProviderEntryResolution(providerId, library)?.selectedEntry ?? null;
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

export function getSelectedBuiltinVariant(providerId: string, library: ProviderIconLibrary = {}): LobehubIconVariant {
  const selectedEntry = resolveProviderEntryResolution(providerId, library)?.selectedEntry ?? null;
  if (!selectedEntry) {
    return getActiveDefaultVariant();
  }

  return selectedEntry.variant ?? 'auto';
}

export function getPreviewUrlForEntry(app: App, entry: ProviderIconEntry): string | null {
  if (entry.type === 'mapped') {
    return getPreviewUrlForLobehubIcon(entry.source, entry.variant ?? 'auto')?.previewUrl ?? null;
  }

  if (entry.type === 'builtin') {
    const parsed = parseBuiltinSource(entry.source);
    if (!parsed) {
      return null;
    }

    return getBuiltinPreview(app, findBuiltinIcon(entry.source) ?? {
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

export function getBuiltinPreviewCandidates(
  app: App,
  libraryId: BuiltinIconLibraryId,
  iconId: string,
  requestedVariant: LobehubIconVariant = 'auto',
): string[] {
  if (libraryId === 'lobehub') {
    return getPreviewUrlForLobehubIcon(iconId, requestedVariant)?.previewCandidates ?? [];
  }

  const adapter = app.vault.adapter;
  if (typeof adapter.getResourcePath !== 'function') {
    return [];
  }

  return [adapter.getResourcePath(getBundledOpencodeAssetPath(app, iconId))];
}

export function getPreviewUrlForLobehubIcon(
  iconId: string,
  requestedVariant: LobehubIconVariant,
  cacheDirectory: string = DEFAULT_ICON_CACHE_DIR,
): LobehubIconPreviewState | null {
  const manifestEntry = getLobehubManifestEntry(iconId);
  if (!manifestEntry) {
    return null;
  }

  const candidateVariants = getLobehubCandidateVariants(requestedVariant);
  const themeKey = getActiveThemeVariant();
  const candidates = candidateVariants.flatMap((variant, index) => {
    const variantEntry = manifestEntry.variants[variant];
    if (!variantEntry?.staticSupport) {
      return [];
    }

    const format: ProviderIconResolvedFormat = variant === 'avatar' ? 'avatar' : 'svg';
    const remoteUrl = getManifestVariantUrl(variantEntry, format, themeKey);
    if (!remoteUrl) {
      return [];
    }

    return [{
      cachePath: getLobehubCachePath({
        cacheDirectory,
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

export function getMimeTypeForResolvedFormat(format: ProviderIconResolvedFormat): string {
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

export function getResolvedFormatForMimeType(mimeType?: string): ProviderIconResolvedFormat | undefined {
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

export function isLobehubBuiltinEntry(entry: ProviderIconEntry): boolean {
  return entry.type === 'builtin' && parseBuiltinSource(entry.source)?.libraryId === 'lobehub';
}

export function isLobehubBackedEntry(entry: ProviderIconEntry): boolean {
  if (entry.type === 'mapped') {
    return true;
  }

  if (entry.type !== 'builtin') {
    return false;
  }

  return parseBuiltinSource(entry.source)?.libraryId === 'lobehub';
}

export function getLobehubIconId(entry: ProviderIconEntry): string | null {
  if (entry.type === 'mapped') {
    return entry.source;
  }

  if (entry.type !== 'builtin') {
    return null;
  }

  const parsed = parseBuiltinSource(entry.source);
  return parsed?.libraryId === 'lobehub' ? parsed.iconId : null;
}

export function getActiveDefaultVariant(): LobehubIconVariant {
  const value = document.body.dataset.opencodianProviderIconVariant;
  return ALL_VARIANT_OPTIONS.includes(value as LobehubIconVariant)
    ? value as LobehubIconVariant
    : 'auto';
}

export function getActiveColorMode(): ProviderIconColorMode {
  const value = document.body.dataset.opencodianProviderIconMode;
  return value === 'color' || value === 'monochrome' || value === 'system'
    ? value
    : 'system';
}

export function getActiveThemeVariant(): 'light' | 'dark' {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

export function getBundledOpencodeAssetPath(app: App, iconId: string): string {
  const configDir = typeof (app.vault as { configDir?: string }).configDir === 'string'
    ? (app.vault as { configDir?: string }).configDir
    : null;
  const resolvedConfigDir = configDir && configDir.trim().length > 0
    ? configDir.trim()
    : '.obsidian';
  return normalizePath(`${resolvedConfigDir}/plugins/opencodian/assets/provider-icons/opencode/${iconId}.svg`);
}

function getBuiltinPreview(
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
    const preview = getPreviewUrlForLobehubIcon(definition.iconId, requestedVariant);
    return {
      previewCandidates: preview?.previewCandidates ?? [],
      previewUrl: preview?.previewUrl ?? null,
      resolvedFormat: preview?.resolvedFormat,
      resolvedVariant: preview?.resolvedVariant,
    };
  }

  return {
    previewCandidates: getBuiltinPreviewCandidates(app, definition.libraryId, definition.iconId, requestedVariant),
    previewUrl: getBuiltinPreviewUrl(app, definition.libraryId, definition.iconId, requestedVariant),
    resolvedFormat: 'svg',
    resolvedVariant: 'mono',
  };
}

function getBuiltinPreviewUrl(
  app: App,
  libraryId: BuiltinIconLibraryId,
  iconId: string,
  requestedVariant: LobehubIconVariant = 'auto',
): string | null {
  const candidates = getBuiltinPreviewCandidates(app, libraryId, iconId, requestedVariant);
  return candidates[0] ?? null;
}

function isDefinitionAvailableForVariant(
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

function getLobehubManifestEntry(iconId: string): LobehubManifestEntry | null {
  return LOBEHUB_MANIFEST_BY_ICON_ID.get(iconId) ?? LOBEHUB_MANIFEST_BY_ICON_ID.get(iconId.toLowerCase()) ?? null;
}

function getLobehubCandidateVariants(requestedVariant: LobehubIconVariant): ResolvedLobehubVariant[] {
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
    pushVariants(getFallbackVariantSequence(requestedVariant));
  } else {
    const globalVariant = getActiveDefaultVariant();
    if (globalVariant !== 'auto') {
      pushVariants(getFallbackVariantSequence(globalVariant));
    }

    pushVariants(getColorModeVariantSequence(getActiveColorMode()));
  }

  pushVariants(['mono', 'color', 'brand-color', 'brand', 'text-color', 'text', 'text-cn', 'avatar']);
  return orderedVariants;
}

function getFallbackVariantSequence(requestedVariant: LobehubIconVariant): LobehubIconVariant[] {
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

function getColorModeVariantSequence(colorMode: ProviderIconColorMode): LobehubIconVariant[] {
  switch (colorMode) {
    case 'color':
      return ['color', 'brand-color', 'brand', 'mono', 'avatar', 'text-color', 'text', 'text-cn'];
    case 'monochrome':
    case 'system':
    default:
      return ['mono', 'brand', 'brand-color', 'color', 'avatar', 'text', 'text-color', 'text-cn'];
  }
}

function getManifestVariantUrl(
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

function getLobehubCachePath({
  cacheDirectory,
  iconId,
  requestedVariant,
  resolvedVariant,
  format,
  themeKey,
}: LobehubCachePathOptions): string {
  const safeIconId = iconId.replace(/[^a-z0-9_-]/gi, '-');
  const extension = format === 'avatar' ? 'webp' : format;
  return normalizePath(
    `${cacheDirectory}/lobehub-${safeIconId}-${requestedVariant}-${resolvedVariant}-${themeKey}-${format}.${extension}`,
  );
}

function getRecommendedBuiltinIcons(
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
