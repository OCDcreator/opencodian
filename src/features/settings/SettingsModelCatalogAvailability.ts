import {
  type ModelCatalogStateMode,
  type ProviderAvailabilityProbe,
} from '../../core/config';
import type { ModelCatalogProvider } from '../../core/config/modelConfig';
import { t } from '../../i18n';

export interface ProviderAvailabilityCheckState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  probe?: ProviderAvailabilityProbe;
  error?: string;
}

export type ProviderDisabledReason = 'project' | 'server' | null;

export interface ProviderAvailabilityDisplayState {
  provider: ModelCatalogProvider;
  providerEnabled: boolean;
  disabledCount: number;
  primaryDisabledReason: ProviderDisabledReason;
  mode: ModelCatalogStateMode;
}

export function describeModelAvailabilitySummary(
  state: ProviderAvailabilityDisplayState,
): string {
  const { provider, providerEnabled, disabledCount, primaryDisabledReason, mode } = state;

  if (mode === 'server' && isProviderDisabledByScope(provider, 'global')) {
    return t('settings.model.availability.summary.serverDisabled', {
      id: provider.id,
      count: String(provider.models.length),
    });
  }

  if (!providerEnabled) {
    if (primaryDisabledReason === 'project') {
      return t('settings.model.availability.summary.projectDisabled', {
        id: provider.id,
        count: String(provider.models.length),
      });
    }

    if (primaryDisabledReason === 'server') {
      return t('settings.model.availability.summary.serverDisabled', {
        id: provider.id,
        count: String(provider.models.length),
      });
    }

    return t('settings.model.availability.summary.providerDisabled', {
      id: provider.id,
      count: String(provider.models.length),
    });
  }

  if (disabledCount > 0) {
    return t('settings.model.availability.summary.partial', {
      id: provider.id,
      count: String(provider.models.length),
      disabled: String(disabledCount),
    });
  }

  if (isProviderDisabledByScope(provider, 'global')) {
    return t('settings.model.availability.summary.serverDisabledOverridden', {
      id: provider.id,
      count: String(provider.models.length),
    });
  }

  return t('settings.model.availability.summary.available', {
    id: provider.id,
    count: String(provider.models.length),
  });
}

export function getProviderPrimaryDisabledReason(
  provider: ModelCatalogProvider,
  providerEnabled: boolean,
): ProviderDisabledReason {
  if (providerEnabled) {
    return null;
  }

  if (isProviderDisabledByScope(provider, 'project')) {
    return 'project';
  }

  if (isProviderDisabledByScope(provider, 'global')) {
    return 'server';
  }

  return null;
}

export function getProviderAvailabilityStatusClass(
  state: ProviderAvailabilityDisplayState,
): 'is-disabled' | 'is-partial' | 'is-available' {
  const { provider, providerEnabled, disabledCount, mode } = state;

  if (mode === 'server' && isProviderDisabledByScope(provider, 'global')) {
    return 'is-disabled';
  }

  if (!providerEnabled) {
    return 'is-disabled';
  }

  if (disabledCount > 0) {
    return 'is-partial';
  }

  return 'is-available';
}

export function getProviderAvailabilityStatusLabel(
  state: ProviderAvailabilityDisplayState,
): string {
  const { provider, providerEnabled, disabledCount, primaryDisabledReason, mode } = state;

  if (mode === 'server' && isProviderDisabledByScope(provider, 'global')) {
    return t('settings.model.availability.status.serverDisabled');
  }

  if (!providerEnabled) {
    if (primaryDisabledReason === 'project') {
      return t('settings.model.availability.status.projectDisabled');
    }

    if (primaryDisabledReason === 'server') {
      return t('settings.model.availability.status.serverDisabled');
    }

    return t('settings.model.availability.status.providerDisabled');
  }

  return disabledCount > 0
    ? t('settings.model.availability.status.partial')
    : t('settings.model.availability.status.available');
}

export function getProviderServerConstraintBadge(
  state: ProviderAvailabilityDisplayState,
): { text: string; className: 'is-disabled' | 'is-partial' } | null {
  const { provider, providerEnabled, primaryDisabledReason, mode } = state;

  if (!isProviderDisabledByScope(provider, 'global')) {
    return null;
  }

  if (mode === 'server' || primaryDisabledReason === 'server') {
    return null;
  }

  return {
    text: providerEnabled
      ? t('settings.model.availability.status.serverDisabledInherited')
      : t('settings.model.availability.status.serverDisabled'),
    className: providerEnabled ? 'is-partial' : 'is-disabled',
  };
}

export function getProviderAvailabilityProbeBadge(
  state: ProviderAvailabilityCheckState,
): { text: string; className: 'is-available' | 'is-partial' | 'is-disabled' } | null {
  switch (state.status) {
    case 'loading':
      return {
        text: t('settings.model.availability.check.loading'),
        className: 'is-partial',
      };
    case 'error':
      return {
        text: t('settings.model.availability.check.failedBadge'),
        className: 'is-disabled',
      };
    case 'ready':
      if (!state.probe) {
        return null;
      }

      switch (state.probe.status) {
        case 'available':
          return {
            text: t('settings.model.availability.check.availableBadge'),
            className: 'is-available',
          };
        case 'send_failed':
          return {
            text: t('settings.model.availability.check.failedBadge'),
            className: 'is-disabled',
          };
        case 'catalog_only':
          return {
            text: t('settings.model.availability.check.catalogOnlyBadge'),
            className: 'is-partial',
          };
        case 'project_disabled':
          return {
            text: t('settings.model.availability.check.projectDisabledBadge'),
            className: 'is-disabled',
          };
        case 'server_disabled':
          return {
            text: t('settings.model.availability.check.serverDisabledBadge'),
            className: 'is-disabled',
          };
        case 'missing':
        default:
          return {
            text: t('settings.model.availability.check.missingBadge'),
            className: 'is-disabled',
          };
      }
    case 'idle':
    default:
      return null;
  }
}

export function describeProviderAvailabilityProbe(
  state: ProviderAvailabilityCheckState,
): { text: string; className: string } | null {
  if (state.status === 'loading') {
    return {
      text: t('settings.model.availability.check.loadingDetail'),
      className: 'is-loading',
    };
  }

  if (state.status === 'error') {
    return {
      text: t('settings.model.availability.check.failedDetail', {
        message: state.error ?? t('settings.model.availability.check.unknownError'),
      }),
      className: 'is-error',
    };
  }

  if (state.status !== 'ready' || !state.probe) {
    return null;
  }

  const runtimeCount = String(state.probe.runtimeModelCount);
  const catalogCount = String(state.probe.catalogModelCount);
  const testedModelId = state.probe.testedModelId ?? t('settings.model.availability.check.unknownModel');
  switch (state.probe.status) {
    case 'available':
      return {
        text: state.probe.overridesServerDisabled
          ? t('settings.model.availability.check.availableOverrideDetail', { model: testedModelId })
          : t('settings.model.availability.check.availableDetail', { model: testedModelId }),
        className: 'is-success',
      };
    case 'send_failed':
      return {
        text: t('settings.model.availability.check.sendFailedDetail', {
          model: testedModelId,
          message: state.probe.sendTestError ?? t('settings.model.availability.check.unknownError'),
        }),
        className: 'is-error',
      };
    case 'project_disabled':
      return {
        text: state.probe.runtimeModelCount > 0
          ? t('settings.model.availability.check.projectDisabledWithRuntimeDetail', { count: runtimeCount })
          : t('settings.model.availability.check.projectDisabledDetail'),
        className: 'is-error',
      };
    case 'server_disabled':
      return {
        text: t('settings.model.availability.check.serverDisabledDetail'),
        className: 'is-error',
      };
    case 'catalog_only':
      return {
        text: state.probe.serverDisabled && state.probe.overridesServerDisabled
          ? t('settings.model.availability.check.catalogOnlyOverrideDetail', { count: catalogCount })
          : t('settings.model.availability.check.catalogOnlyDetail', { count: catalogCount }),
        className: 'is-warning',
      };
    case 'missing':
    default:
      return {
        text: t('settings.model.availability.check.missingDetail'),
        className: 'is-warning',
      };
  }
}

export function describeProviderModels(
  provider: ModelCatalogProvider,
  placeholderReason: 'project' | 'server' | null = null,
): string {
  if (provider.models.length === 0 && placeholderReason === 'project') {
    return t('settings.model.catalog.hiddenByProjectDisable');
  }

  if (provider.models.length === 0 && placeholderReason === 'server') {
    return t('settings.model.catalog.hiddenByServerDisable');
  }

  const modelNames = provider.models.map((model) => model.name);
  if (modelNames.length <= 6) {
    return modelNames.join(' · ');
  }

  const preview = modelNames.slice(0, 6).join(' · ');
  return `${preview} · +${modelNames.length - 6}`;
}

export function getCatalogPlaceholderReason(
  provider: ModelCatalogProvider,
  mode: ModelCatalogStateMode,
): 'project' | 'server' | null {
  if (provider.models.length > 0) {
    return null;
  }

  if (mode === 'server' && isProviderDisabledByScope(provider, 'global')) {
    return 'server';
  }

  if (mode === 'disabled') {
    if (isProviderDisabledByScope(provider, 'project')) {
      return 'project';
    }
    if (isProviderDisabledByScope(provider, 'global')) {
      return 'server';
    }
  }

  return null;
}

export function isProviderDisabledByScope(provider: ModelCatalogProvider, scope: 'global' | 'project'): boolean {
  return provider.disabledScopes?.includes(scope) ?? false;
}
