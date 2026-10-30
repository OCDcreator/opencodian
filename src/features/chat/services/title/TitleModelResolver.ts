import { parseModelReference, resolveModelSelection } from '../../../../core/config/modelConfig';
import type { AgentBackendKind, ConversationTitleState } from '../../../../core/types/chat';
import type { TitleGenerationPort } from './TitleGenerationPort';

export interface TitleModel {
  provider: string;
  model: string;
}

export interface ResolvedTitleModel extends TitleModel {
  source: NonNullable<ConversationTitleState['modelSource']>;
}

/** The owning adapter's catalog seams. No legacy service fallback is allowed. */
interface TitleCatalogAdapter {
  getModelSelectorProviders?(): Promise<unknown>;
  getAvailableModels?(): Promise<unknown>;
  supportedModels?(): Promise<unknown>;
  getModelList?(): Promise<unknown>;
  getWorkspaceModelCatalog?(): Promise<{ models: unknown }>;
}

const UNAVAILABLE = 'Configured AI title model is unavailable';
const LIGHTWEIGHT = [/flash[-_. ]?lite/i, /flash/i, /haiku/i, /mini/i, /nano/i, /luna/i];

/** Isolates the six native catalog formats and provider boundaries from title lifecycle. */
export class TitleModelResolver {
  constructor(private readonly port: Pick<TitleGenerationPort, 'settings' | 'modelConfigService' | 'agentServiceRegistry'>) {}

  async resolve(backend: AgentBackendKind, current: TitleModel): Promise<ResolvedTitleModel> {
    const configured = (backend === 'opencode' || backend === 'opencode2'
      ? this.port.settings.aiTitleModel : this.port.settings.aiTitleModelOverrides?.[backend] ?? '').trim();
    const explicit = configured ? this.parseConfigured(backend, configured, current.provider) : null;
    if (configured && !explicit) throw new Error(UNAVAILABLE);
    if (backend === 'opencode') return this.resolveLegacy(current, explicit);

    let models: TitleModel[];
    try {
      models = await this.readCatalog(backend, current.provider);
    } catch {
      if (explicit) throw new Error(UNAVAILABLE);
      return { ...current, source: 'current' };
    }
    const enabled = models.filter((candidate) => !this.port.settings.disabledModelRefs.includes(`${candidate.provider}/${candidate.model}`));
    if (explicit) {
      if (!enabled.some((candidate) => candidate.provider === explicit.provider && candidate.model === explicit.model)) {
        throw new Error(UNAVAILABLE);
      }
      return { ...explicit, source: 'configured' };
    }
    // Keep an already-lightweight chat model; scanning first can needlessly
    // select another model that the gateway advertises but this account cannot use.
    if (LIGHTWEIGHT.some((pattern) => pattern.test(current.model))
      && enabled.some((candidate) => candidate.provider === current.provider && candidate.model === current.model)) {
      return { ...current, source: 'current' };
    }
    // A family-name heuristic, not a promise about current prices. Never cross providers.
    const lightweight = enabled.filter((candidate) => candidate.provider === current.provider)
      .map((candidate) => ({ candidate, rank: LIGHTWEIGHT.findIndex((pattern) => pattern.test(candidate.model)) }))
      .filter(({ rank }) => rank >= 0)
      .sort((a, b) => a.rank - b.rank || b.candidate.model.localeCompare(a.candidate.model, undefined, { numeric: true }))[0];
    return lightweight
      ? { ...lightweight.candidate, source: 'lightweight' }
      : { ...current, source: 'current' };
  }

  private parseConfigured(backend: AgentBackendKind, value: string, provider: string): TitleModel | null {
    // These CLIs own provider configuration; their native model IDs may contain slashes.
    if (backend === 'claude-code' || backend === 'codex') {
      return { provider, model: value };
    }
    return parseModelReference(value);
  }

  private async readCatalog(backend: AgentBackendKind, provider: string): Promise<TitleModel[]> {
    const adapter = this.port.agentServiceRegistry.get(backend) as unknown as TitleCatalogAdapter | undefined;
    if (!adapter) throw new Error('Title backend unavailable');
    const raw = backend === 'claude-code' ? await adapter.supportedModels?.()
      : backend === 'codex' ? await adapter.getModelList?.()
        : backend === 'zcode' && adapter.getWorkspaceModelCatalog ? (await adapter.getWorkspaceModelCatalog()).models
          : adapter.getModelSelectorProviders ? await adapter.getModelSelectorProviders()
            : await adapter.getAvailableModels?.();
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item: Record<string, unknown>) => {
      if (!item || typeof item !== 'object' || item.enabled === false || item.hidden === true) return [];
      if (Array.isArray(item.models)) {
        return item.models.flatMap((model: Record<string, unknown>) => this.normalizeModel(model, String(item.id ?? '')));
      }
      const owner = backend === 'claude-code' || backend === 'codex'
        ? provider : String(item.provider ?? item.providerId ?? '');
      return this.normalizeModel(item, owner);
    });
  }

  private normalizeModel(row: Record<string, unknown>, provider: string): TitleModel[] {
    if (!row || typeof row !== 'object' || row.enabled === false || row.hidden === true) return [];
    const model = row.id ?? row.modelId ?? row.slug;
    return typeof model === 'string' && model && provider ? [{ provider, model }] : [];
  }

  private async resolveLegacy(current: TitleModel, explicit: TitleModel | null): Promise<ResolvedTitleModel> {
    if (!explicit) return { ...current, source: 'current' };
    if (!this.port.modelConfigService) return { ...explicit, source: 'configured' };
    try {
      const catalogs = await this.port.modelConfigService.getCatalogs(
        this.port.settings.modelSourceMode, this.port.settings.disabledModelRefs,
      );
      const resolution = resolveModelSelection(catalogs.baseEffective, catalogs.effective, explicit.provider, explicit.model);
      if (resolution.status !== 'available') throw new Error(UNAVAILABLE);
      return { ...explicit, source: 'configured' };
    } catch (error) {
      if (error instanceof Error && error.message === UNAVAILABLE) throw error;
      return { ...current, source: 'current' };
    }
  }
}
