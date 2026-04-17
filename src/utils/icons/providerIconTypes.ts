import type {
  LobehubIconVariant,
  ProviderIconEntry,
  ProviderIconLibrary,
  ProviderIconResolvedFormat,
  StaticLobehubIconVariant,
} from '../../core/types';
import type { BuiltinIconLibraryId } from './builtinIconRegistry';

export type ResolvedLobehubVariant = Exclude<LobehubIconVariant, 'auto' | 'combine'>;

export interface BuiltinIconOption {
  libraryId: BuiltinIconLibraryId;
  iconId: string;
  displayName: string;
  source: string;
  previewUrl: string | null;
  previewCandidates: string[];
  requestedVariant: LobehubIconVariant;
  resolvedVariant?: ResolvedLobehubVariant;
  resolvedFormat?: ProviderIconResolvedFormat;
  staticVariants: StaticLobehubIconVariant[];
  supportedVariants: LobehubIconVariant[];
  isRecommended: boolean;
  isSelected: boolean;
}

export interface SelectBuiltinIconRequest {
  providerId: string;
  libraryId: BuiltinIconLibraryId;
  iconId: string;
  library: ProviderIconLibrary;
  variant?: LobehubIconVariant;
}

export interface LobehubIconPreviewState {
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
}

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
  resolvedVariant?: ResolvedLobehubVariant;
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

export interface ResolveIconUrlOptions {
  retryFailed?: boolean;
}

export interface ProviderIconEntryPreviewMetadata {
  fallbackUsed: boolean;
  iconId: string | null;
  iconUrl: string | null;
  requestedVariant?: LobehubIconVariant;
  resolvedFormat?: ProviderIconResolvedFormat;
  resolvedVariant?: ResolvedLobehubVariant;
  sourceLabel: string;
}

export interface ResolvedProviderIconAsset {
  cachePath: string | null;
  cached: boolean;
  fallbackUsed: boolean;
  iconId: string | null;
  iconUrl: string | null;
  requestedVariant?: LobehubIconVariant;
  resolvedFormat?: ProviderIconResolvedFormat;
  resolvedVariant?: ResolvedLobehubVariant;
  sourceLabel: string;
}

export interface ProviderIconAssetCandidate {
  cacheMimeType?: string;
  cachePath: string | null;
  continueOnLoadError?: boolean;
  fallbackUsed: boolean;
  iconId: string | null;
  loadAsset?: () => Promise<{ data: ArrayBuffer; mimeType: string }>;
  previewResolvedFormat?: ProviderIconResolvedFormat;
  previewUrl: string | null;
  requestedVariant?: LobehubIconVariant;
  resolvedFormat?: ProviderIconResolvedFormat;
  resolvedVariant?: ResolvedLobehubVariant;
  sourceLabel: string;
}
