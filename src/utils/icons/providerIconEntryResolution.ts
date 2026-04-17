import type {
  LobehubIconVariant,
  ProviderIconEntry,
  ProviderIconLibrary,
} from '../../core/types';
import {
  type BuiltinIconLibraryId,
  findBuiltinIcon,
  formatBuiltinSource,
  parseBuiltinSource,
  PROVIDER_ICON_MAP,
  resolveBuiltinIconMatch,
} from './builtinIconRegistry';

export interface ProviderIconEntryResolution {
  defaultEntry: ProviderIconEntry | null;
  editableEntries: ProviderIconEntry[];
  effectiveEntries: ProviderIconEntry[];
  requestedProviderId: string;
  resolvedProviderId: string | null;
  selectedEntry: ProviderIconEntry | null;
  storageProviderId: string;
}

export function getProviderIconId(providerId: string): string | null {
  if (!providerId) {
    return null;
  }

  const lowerId = providerId.toLowerCase();
  if (PROVIDER_ICON_MAP[lowerId]) {
    return PROVIDER_ICON_MAP[lowerId];
  }

  const normalizedId = lowerId.replace(/[^a-z0-9]/g, '');
  if (PROVIDER_ICON_MAP[normalizedId]) {
    return PROVIDER_ICON_MAP[normalizedId];
  }

  const englishParts = lowerId.match(/[a-z]+/g);
  if (englishParts) {
    for (const part of englishParts) {
      if (part.length < 2) {
        continue;
      }

      if (PROVIDER_ICON_MAP[part]) {
        return PROVIDER_ICON_MAP[part];
      }
    }

    const combined = englishParts.join('');
    if (PROVIDER_ICON_MAP[combined]) {
      return PROVIDER_ICON_MAP[combined];
    }
  }

  for (const [key, value] of Object.entries(PROVIDER_ICON_MAP)) {
    if (normalizedId.includes(key) || lowerId.includes(key)) {
      return value;
    }
  }

  for (const [key, value] of Object.entries(PROVIDER_ICON_MAP)) {
    if (key.includes(normalizedId) || key.includes(lowerId)) {
      return value;
    }
  }

  return null;
}

export function hasProviderIcon(providerId: string): boolean {
  return getDefaultProviderIconEntry(providerId) !== null;
}

export function getDefaultProviderIconEntry(providerId: string): ProviderIconEntry | null {
  const iconId = getProviderIconId(providerId);
  if (!iconId) {
    const builtinMatch = resolveBuiltinIconMatch(providerId);
    return builtinMatch
      ? createBuiltinEntry(builtinMatch.libraryId, builtinMatch.iconId, false, 'auto')
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

export function getEffectiveProviderEntries(
  providerId: string,
  library: ProviderIconLibrary,
): ProviderIconEntry[] {
  return resolveProviderEntryResolution(providerId, library)?.effectiveEntries ?? [];
}

export function persistDefaultProviderEntries(
  providerIds: string[],
  library: ProviderIconLibrary,
): ProviderIconLibrary {
  let nextLibrary = { ...library };

  for (const providerId of uniqueProviderIds(providerIds)) {
    const resolution = resolveProviderEntryResolution(providerId, nextLibrary);
    if (!resolution || resolution.resolvedProviderId || !resolution.defaultEntry) {
      continue;
    }

    nextLibrary = {
      ...nextLibrary,
      [resolution.storageProviderId]: [resolution.defaultEntry],
    };
  }

  return nextLibrary;
}

export function updateProviderEntries(
  providerId: string,
  entries: ProviderIconEntry[],
  library: ProviderIconLibrary,
): ProviderIconLibrary {
  const resolution = resolveProviderEntryResolution(providerId, library);
  if (!resolution) {
    return library;
  }

  const sanitizedEntries = entries.filter((entry, index, collection) =>
    Boolean(entry.id)
    && Boolean(entry.source)
    && collection.findIndex((candidate) => candidate.id === entry.id) === index,
  );

  if (sanitizedEntries.length === 0) {
    const nextLibrary = { ...library };
    delete nextLibrary[resolution.storageProviderId];
    return nextLibrary;
  }

  return {
    ...library,
    [resolution.storageProviderId]: sanitizedEntries,
  };
}

export function removeProviderEntry(
  providerId: string,
  entryId: string,
  library: ProviderIconLibrary,
): ProviderIconLibrary {
  const resolution = resolveProviderEntryResolution(providerId, library);
  if (!resolution) {
    return library;
  }

  const nextEntries = (library[resolution.storageProviderId] ?? []).filter((entry) => entry.id !== entryId);
  return updateProviderEntries(providerId, nextEntries, library);
}

export function createBuiltinEntry(
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

export function areEquivalentProviderIconEntries(
  left: ProviderIconEntry,
  right: ProviderIconEntry,
): boolean {
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

export function uniqueProviderIds(providerIds: string[]): string[] {
  return Array.from(new Set(
    providerIds
      .map((providerId) => providerId.trim())
      .filter(Boolean),
  ));
}

export function mergeProviderIds(currentProviderIds: string[], savedProviderIds: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const providerId of [...currentProviderIds, ...savedProviderIds]) {
    const trimmedProviderId = providerId.trim();
    if (!trimmedProviderId) {
      continue;
    }

    const canonicalKey = getCanonicalProviderKey(trimmedProviderId);
    if (seen.has(canonicalKey)) {
      continue;
    }

    seen.add(canonicalKey);
    merged.push(trimmedProviderId);
  }

  return merged;
}

export function resolveProviderEntryResolution(
  providerId: string,
  library: ProviderIconLibrary,
): ProviderIconEntryResolution | null {
  const requestedProviderId = providerId.trim();
  if (!requestedProviderId) {
    return null;
  }

  const resolvedProviderId = resolveLibraryProviderId(requestedProviderId, library);
  const storageProviderId = resolvedProviderId ?? requestedProviderId;
  const savedEntries = resolvedProviderId ? [...(library[resolvedProviderId] ?? [])] : [];
  const defaultEntry = getDefaultProviderIconEntry(requestedProviderId);
  const effectiveEntries = mergeDefaultEntry(savedEntries, defaultEntry);

  return {
    defaultEntry,
    editableEntries: savedEntries.length > 0 ? savedEntries : (defaultEntry ? [defaultEntry] : []),
    effectiveEntries,
    requestedProviderId,
    resolvedProviderId,
    selectedEntry: effectiveEntries[0] ?? null,
    storageProviderId,
  };
}

export function getCanonicalProviderKey(providerId: string): string {
  return providerId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getProviderIconEntryIconId(entry: ProviderIconEntry): string | null {
  if (entry.type === 'mapped') {
    return entry.source;
  }

  if (entry.type === 'builtin') {
    return parseBuiltinSource(entry.source)?.iconId ?? null;
  }

  return null;
}

export function getProviderIconEntrySourceLabel(entry: ProviderIconEntry): string {
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

function resolveLibraryProviderId(
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

  const canonicalKey = getCanonicalProviderKey(trimmedProviderId);
  for (const savedProviderId of Object.keys(library)) {
    if (getCanonicalProviderKey(savedProviderId) === canonicalKey) {
      return savedProviderId;
    }
  }

  return null;
}

function mergeDefaultEntry(
  entries: ProviderIconEntry[],
  defaultEntry: ProviderIconEntry | null,
): ProviderIconEntry[] {
  if (!defaultEntry) {
    return [...entries];
  }

  if (entries.some((entry) => areEquivalentProviderIconEntries(entry, defaultEntry))) {
    return [...entries];
  }

  return [...entries, defaultEntry];
}
