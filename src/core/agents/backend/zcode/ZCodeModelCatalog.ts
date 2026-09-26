/**
 * ZCodeModelCatalog — the live ZCode model/thinking/mode catalog surface and
 * its validation rules.
 *
 * The catalog comes exclusively from the runtime (session snapshot
 * `settings` and `state.updated` broadcasts), never from a hard-coded mirror.
 * When nothing has been observed, every lookup reports unavailable instead of
 * pretending to know. Model selections are validated against the catalog
 * before any native request is sent (unsupported values never reach the wire).
 */

/** Permission mode values accepted by `session/setMode` (native `$j` enum). */
export const ZCODE_MODES = ['plan', 'build', 'edit', 'yolo', 'auto'] as const;
export type ZCodeMode = (typeof ZCODE_MODES)[number];

/** How much the official runtime actually confirmed after a mode mutation. */
export type ZCodeModeReadback =
  | { readonly kind: 'confirmed'; readonly mode: ZCodeMode }
  | {
      /**
       * ZCode 0.16.9 accepts a plan request but projects its base mode (`build`)
       * in snapshots instead of exposing the independent plan flag.
       */
      readonly kind: 'plan-requested-readback-unavailable';
      readonly reportedBaseMode: string | null;
    }
  | { readonly kind: 'mismatch'; readonly requestedMode: ZCodeMode; readonly reportedMode: string | null };

export interface ZCodeReasoningLevel {
  readonly value: string;
  readonly label: string;
}

export interface ZCodeModelCatalogEntry {
  readonly providerId: string;
  readonly modelId: string;
  readonly label: string;
  readonly providerLabel: string;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  readonly reasoningLevels: readonly ZCodeReasoningLevel[];
  readonly defaultReasoningLevel: string | null;
  readonly supportsImageInput: boolean;
}

export interface ZCodeSlashCommandEntry {
  readonly name: string;
  readonly description: string;
  readonly inputHint: string;
  readonly source: string;
}

export interface ZCodeModelCatalog {
  readonly models: readonly ZCodeModelCatalogEntry[];
  readonly currentModel: { readonly providerId: string; readonly modelId: string; readonly reasoningLevel: string | null } | null;
  readonly thoughtLevels: readonly ZCodeReasoningLevel[];
  readonly currentThoughtLevel: string | null;
  readonly thoughtLevelEnabled: boolean | null;
  readonly currentMode: string | null;
  readonly slashCommands: readonly ZCodeSlashCommandEntry[];
  readonly observedAt: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function parseLevels(raw: unknown): ZCodeReasoningLevel[] {
  return Array.isArray(raw)
    ? raw
        .map((entry) => asRecord(entry))
        .filter((entry) => typeof entry['value'] === 'string' && entry['value'])
        .map((entry) => ({ value: entry['value'] as string, label: asString(entry['label']) || (entry['value'] as string) }))
    : [];
}

/**
 * Parse the runtime `settings` payload (session snapshot or setModel result)
 * into the normalized catalog. Returns null when the payload carries no
 * catalog at all (the caller then keeps the previous snapshot or reports
 * unavailable).
 */
export function parseZCodeCatalogSnapshot(settings: unknown): ZCodeModelCatalog | null {
  const root = asRecord(settings);
  const model = asRecord(root['model']);
  const available = model['available'];
  if (!Array.isArray(available) || available.length === 0) {
    return null;
  }
  const models: ZCodeModelCatalogEntry[] = [];
  for (const rawEntry of available) {
    const entry = asRecord(rawEntry);
    const ref = asRecord(entry['ref']);
    const providerId = asString(ref['providerId']);
    const modelId = asString(ref['modelId']);
    if (!providerId || !modelId) {
      continue;
    }
    const reasoning = asRecord(entry['reasoning']);
    const properties = asRecord(entry['properties']);
    const inputFormat = asRecord(properties['inputFormat']);
    models.push({
      providerId,
      modelId,
      label: asString(entry['label']) || modelId,
      providerLabel: asString(entry['providerLabel']) || providerId,
      contextWindow: asFiniteNumber(entry['contextWindow']),
      maxOutputTokens: asFiniteNumber(entry['maxOutputTokens']),
      reasoningLevels: parseLevels(reasoning['levels']),
      defaultReasoningLevel: typeof reasoning['defaultLevel'] === 'string' ? reasoning['defaultLevel'] as string : null,
      supportsImageInput: inputFormat['supportsImage'] === true,
    });
  }
  if (models.length === 0) {
    return null;
  }

  const current = asRecord(model['current']);
  const currentOptions = asRecord(current['options']);
  const currentModel = asString(current['providerId']) && asString(current['modelId'])
    ? {
        providerId: current['providerId'] as string,
        modelId: current['modelId'] as string,
        reasoningLevel: typeof currentOptions['reasoningLevel'] === 'string' ? currentOptions['reasoningLevel'] as string : null,
      }
    : null;

  const thoughtLevel = asRecord(root['thoughtLevel']);
  const mode = asRecord(root['mode']);
  const slashRaw = root['slashCommands'];
  const slashCommands: ZCodeSlashCommandEntry[] = Array.isArray(slashRaw)
    ? slashRaw
        .map((entry) => asRecord(entry))
        .filter((entry) => typeof entry['name'] === 'string' && entry['name'])
        .map((entry) => ({
          name: entry['name'] as string,
          description: asString(entry['description']),
          inputHint: asString(entry['inputHint']),
          source: asString(entry['source']) || 'unknown',
        }))
    : [];

  return {
    models,
    currentModel,
    thoughtLevels: parseLevels(thoughtLevel['available']),
    currentThoughtLevel: typeof thoughtLevel['current'] === 'string' ? thoughtLevel['current'] as string : null,
    thoughtLevelEnabled: typeof thoughtLevel['enabled'] === 'boolean' ? thoughtLevel['enabled'] as boolean : null,
    currentMode: typeof mode['current'] === 'string' ? mode['current'] as string : null,
    slashCommands,
    observedAt: Date.now(),
  };
}

/** Merge a `state.updated` patch into a catalog-shaped settings object. */
export function patchZCodeCatalogSettings(current: unknown, patch: unknown): unknown {
  const base = asRecord(current);
  const update = asRecord(patch);
  return { ...base, ...update };
}

/**
 * Preserve the widest model list while applying a narrower native projection.
 * `session/read` is a current-model projection; it must not erase the live
 * provider catalog learned from `session/create` or `session/resume`.
 */
function mergeCatalogSettingsBase(base: unknown, latest: unknown): unknown {
  const previous = asRecord(base);
  const incoming = asRecord(latest);
  const previousModel = asRecord(previous['model']);
  const incomingModel = asRecord(incoming['model']);
  const previousAvailable = previousModel['available'];
  const incomingAvailable = incomingModel['available'];
  return {
    ...previous,
    ...incoming,
    model: {
      ...previousModel,
      ...incomingModel,
      ...(Array.isArray(previousAvailable) && Array.isArray(incomingAvailable)
        && previousAvailable.length > incomingAvailable.length
        ? { available: previousAvailable }
        : {}),
    },
  };
}

export type ZCodeModelSelectionValidation =
  | { readonly ok: true; readonly reasoningLevel: string | null }
  | {
      readonly ok: false;
      readonly reason: 'model-not-in-catalog' | 'reasoning-required' | 'reasoning-unsupported';
      readonly detail: string;
    };

/**
 * Validate a model selection against the live catalog before it is sent.
 * Models with a reasoning spec need a supported level (explicit or their own
 * default); unsupported values are rejected locally and never reach the wire.
 */
export function validateZCodeModelSelection(
  catalog: ZCodeModelCatalog,
  selection: { providerId: string; modelId: string; reasoningLevel?: string | null },
): ZCodeModelSelectionValidation {
  const entry = catalog.models.find(
    (model) => model.providerId === selection.providerId && model.modelId === selection.modelId,
  );
  if (!entry) {
    return {
      ok: false,
      reason: 'model-not-in-catalog',
      detail: `Model ${selection.providerId}/${selection.modelId} is not in the live ZCode catalog.`,
    };
  }
  if (entry.reasoningLevels.length === 0) {
    if (selection.reasoningLevel) {
      return {
        ok: false,
        reason: 'reasoning-unsupported',
        detail: `Model ${entry.modelId} does not support reasoning levels (catalog reports none).`,
      };
    }
    return { ok: true, reasoningLevel: null };
  }
  const level = selection.reasoningLevel ?? entry.defaultReasoningLevel;
  if (level === null) {
    return {
      ok: false,
      reason: 'reasoning-required',
      detail: `Model ${entry.modelId} requires a reasoning level; supported: ${entry.reasoningLevels.map((item) => item.value).join(', ')}.`,
    };
  }
  if (!entry.reasoningLevels.some((item) => item.value === level)) {
    return {
      ok: false,
      reason: 'reasoning-unsupported',
      detail: `Reasoning level "${level}" is not supported by ${entry.modelId}; supported: ${entry.reasoningLevels.map((item) => item.value).join(', ')}.`,
    };
  }
  return { ok: true, reasoningLevel: level };
}

/** Validate a thinking level against the live thought-level catalog. */
export function validateZCodeThoughtLevel(catalog: ZCodeModelCatalog, level: string): { ok: boolean; detail?: string } {
  if (catalog.thoughtLevels.length === 0) {
    return { ok: false, detail: 'The live ZCode catalog reports no thought levels.' };
  }
  return catalog.thoughtLevels.some((item) => item.value === level)
    ? { ok: true }
    : { ok: false, detail: `Thought level "${level}" is not supported; supported: ${catalog.thoughtLevels.map((item) => item.value).join(', ')}.` };
}

/** Validate a mode value against the native mode enum (rejects before send). */
export function validateZCodeMode(mode: string): mode is ZCodeMode {
  return (ZCODE_MODES as readonly string[]).includes(mode);
}

/**
 * Interpret an official mode snapshot without claiming that a base mode
 * proves or disproves ZCode's independent plan state.
 */
export function classifyZCodeModeReadback(
  requestedMode: ZCodeMode,
  readbackMode: unknown,
): ZCodeModeReadback {
  const reportedMode = typeof readbackMode === 'string' ? readbackMode : null;
  if (requestedMode === 'plan' && reportedMode !== 'plan' && validateZCodeMode(reportedMode ?? '')) {
    return { kind: 'plan-requested-readback-unavailable', reportedBaseMode: reportedMode };
  }
  if (reportedMode === requestedMode) {
    return { kind: 'confirmed', mode: requestedMode };
  }
  return { kind: 'mismatch', requestedMode, reportedMode };
}

/** Parse the persisted default model (`providerId/modelId`) from settings; null when unset or malformed. */
export function parseZCodeDefaultModel(settings: { model?: string } | undefined): { provider: string; model: string } | null {
  const configured = settings?.model?.trim() ?? '';
  if (!configured.includes('/')) {
    return null;
  }
  const [provider, ...rest] = configured.split('/');
  const model = rest.join('/');
  return provider && model ? { provider, model } : null;
}

/** Minimal transport surface the model surface needs (the adapter owns the real transport). */
export interface ZCodeCatalogTransport {
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/**
 * ZCodeModelSurface — owns the live model/thinking/slash catalog and every
 * catalog-driven operation. The adapter delegates here so catalog lifecycle
 * (capture, patches, validation-gated setters, boundary application) has one
 * cohesive home.
 */
export class ZCodeModelSurface {
  private catalog: ZCodeModelCatalog | null = null;
  private catalogSettingsBase: unknown = null;

  /** Latest live catalog observed from the runtime (null = unobserved). */
  getAvailableModelCatalog(): ZCodeModelCatalog | null {
    return this.catalog;
  }

  /** Whether the effective current model accepts image input, or unknown. */
  supportsImagesForCurrentModel(): boolean | null {
    const current = this.catalog?.currentModel;
    if (!current) return null;
    const entry = this.catalog?.models.find((model) =>
      model.providerId === current.providerId && model.modelId === current.modelId);
    return entry?.supportsImageInput ?? null;
  }

  /**
   * Live catalog models for the selector surface. Throws when the catalog has
   * not been observed yet (stale/unavailable is reported, never fabricated).
   */
  async getAvailableModels(): Promise<ZCodeModelCatalog['models']> {
    return this.requireCatalog().models;
  }

  /** Live slash commands discovered from the runtime (empty when unobserved). */
  getSlashCommands(): readonly ZCodeSlashCommandEntry[] {
    return this.catalog?.slashCommands ?? [];
  }

  /** Capture catalog state from a session snapshot result (settings payload). */
  captureCatalogSnapshot(snapshot: unknown, authoritativeCatalog = false): void {
    const settings = asRecord(snapshot)['settings'];
    // slashCommands ride at the snapshot ROOT (outside `settings`) — merge them
    // in so command discovery works on real snapshots; a settings-internal
    // list wins when both exist.
    const rootSlashCommands = asRecord(snapshot)['slashCommands'];
    const merged = rootSlashCommands !== undefined && asRecord(settings)['slashCommands'] === undefined
      ? { ...(settings as Record<string, unknown>), slashCommands: rootSlashCommands }
      : settings;
    const parsed = parseZCodeCatalogSnapshot(merged);
    if (parsed) {
      // ZCode uses two valid snapshot shapes: create/resume carries the full
      // live catalog, while session/read and mutation responses often project
      // `model.available` down to the current model.  Treating that projection
      // as a new catalog is what made the selector collapse to one item after
      // a restore/read.  Keep the widest observed catalog and still apply the
      // newer current model, thought level, mode, and slash-command fields.
      const previous = this.catalog;
      const effective = !authoritativeCatalog && previous && parsed.models.length < previous.models.length
        ? { ...parsed, models: previous.models }
        : parsed;
      this.catalog = effective;
      this.catalogSettingsBase = !authoritativeCatalog && previous && parsed.models.length < previous.models.length
        ? mergeCatalogSettingsBase(this.catalogSettingsBase, merged)
        : merged;
    }
  }

  /** Keep the catalog warm from `state.updated` broadcasts (patch over the base). */
  handleStateUpdated(params: Record<string, unknown>): void {
    const patch = asRecord(params['patch']);
    if (Object.keys(patch).length === 0) {
      return;
    }
    const merged = patchZCodeCatalogSettings(this.catalogSettingsBase ?? {}, patch);
    const parsed = parseZCodeCatalogSnapshot(merged);
    if (parsed) {
      this.catalog = parsed;
      this.catalogSettingsBase = merged;
    }
  }

  /** Set a session's model after validating it against the live catalog (rejected before the wire). */
  async setSessionModel(
    transport: ZCodeCatalogTransport,
    ensureActive: (sessionId: string) => Promise<void>,
    sessionId: string,
    selection: { providerId: string; modelId: string; reasoningLevel?: string | null },
  ): Promise<void> {
    const validation = validateZCodeModelSelection(this.requireCatalog(), selection);
    if (!validation.ok) {
      throw new Error(validation.detail);
    }
    await ensureActive(sessionId);
    const result = await transport.request('session/setModel', {
      sessionId,
      model: {
        providerId: selection.providerId,
        modelId: selection.modelId,
        ...(validation.reasoningLevel ? { options: { reasoningLevel: validation.reasoningLevel } } : {}),
      },
    });
    this.captureCatalogSnapshot(result);
    const readback = await transport.request('session/read', { sessionId });
    this.captureCatalogSnapshot(readback);
    const current = asRecord(asRecord(asRecord(asRecord(readback)['settings'])['model'])['current']);
    const options = asRecord(current['options']);
    if (current['providerId'] !== selection.providerId
      || current['modelId'] !== selection.modelId
      || (validation.reasoningLevel && options['reasoningLevel'] !== validation.reasoningLevel)) {
      throw new Error('ZCode model readback did not confirm the requested selection.');
    }
  }

  /** Set a session's thinking level after validating it against the live catalog. */
  async setSessionThoughtLevel(
    transport: ZCodeCatalogTransport,
    ensureActive: (sessionId: string) => Promise<void>,
    sessionId: string,
    level: string,
  ): Promise<void> {
    const validation = validateZCodeThoughtLevel(this.requireCatalog(), level);
    if (!validation.ok) {
      throw new Error(validation.detail ?? 'Unsupported ZCode thought level.');
    }
    await ensureActive(sessionId);
    const result = await transport.request('session/setThoughtLevel', { sessionId, thoughtLevel: level });
    this.captureCatalogSnapshot(result);
    const readback = await transport.request('session/read', { sessionId });
    this.captureCatalogSnapshot(readback);
    const current = asRecord(asRecord(asRecord(readback)['settings'])['thoughtLevel'])['current'];
    if (current !== level) {
      throw new Error('ZCode thought level readback did not confirm the requested selection.');
    }
  }

  /**
   * Set a session mode after enum validation and report only the native proof
   * the runtime provides. Plan is a separate ZCode state, so its `build`
   * snapshot projection cannot be treated as a failed request.
   */
  async setSessionMode(
    transport: ZCodeCatalogTransport,
    ensureActive: (sessionId: string) => Promise<void>,
    sessionId: string,
    mode: string,
  ): Promise<ZCodeModeReadback> {
    if (!validateZCodeMode(mode)) {
      throw new Error(`ZCode mode "${mode}" is not supported; supported: plan, build, edit, yolo, auto.`);
    }
    await ensureActive(sessionId);
    const result = await transport.request('session/setMode', { sessionId, mode });
    this.captureCatalogSnapshot(result);
    const readback = await transport.request('session/read', { sessionId });
    this.captureCatalogSnapshot(readback);
    const effectiveMode = asRecord(asRecord(asRecord(readback)['settings'])['mode'])['current'];
    const confirmation = classifyZCodeModeReadback(mode, effectiveMode);
    if (confirmation.kind === 'mismatch') {
      throw new Error('ZCode mode readback did not confirm the requested value.');
    }
    return confirmation;
  }

  /**
   * Apply the conversation override at the turn boundary: provider/model
   * select the model, variant its reasoning level — validated against the live
   * catalog and never mid-turn.
   */
  async prepareModelForSend(
    transport: ZCodeCatalogTransport,
    ensureActive: (sessionId: string) => Promise<void>,
    request: { sessionId: string; options?: Record<string, unknown> },
  ): Promise<void> {
    const options = asRecord(request.options);
    const provider = options['provider'];
    const model = options['model'];
    const variant = options['variant'];
    if (typeof provider === 'string' && provider && typeof model === 'string' && model) {
      await this.setSessionModel(transport, ensureActive, request.sessionId, {
        providerId: provider, modelId: model,
        reasoningLevel: typeof variant === 'string' && variant ? variant : undefined,
      });
    } else if ((provider || model) && !(provider && model)) {
      throw new Error('Select both a provider and a model for ZCode.');
    }
  }

  /**
   * Apply persisted defaults at session materialization (never mid-turn and
   * never mutating user configuration).
   */
  async applyPersistedDefaults(
    transport: ZCodeCatalogTransport,
    ensureActive: (sessionId: string) => Promise<void>,
    sessionId: string,
    settings: { model?: string; thinkingLevel?: string; mode?: string },
  ): Promise<void> {
    const configuredModel = (settings.model ?? '').trim();
    if (configuredModel.includes('/')) {
      const [provider, ...rest] = configuredModel.split('/');
      const modelId = rest.join('/');
      if (provider && modelId) {
        await this.setSessionModel(transport, ensureActive, sessionId, { providerId: provider, modelId });
      }
    }
    if (settings.thinkingLevel?.trim()) {
      await this.setSessionThoughtLevel(transport, ensureActive, sessionId, settings.thinkingLevel.trim());
    }
    if (settings.mode?.trim()) {
      await this.setSessionMode(transport, ensureActive, sessionId, settings.mode.trim());
    }
  }

  /** Latest observed catalog or an honest unavailable error. */
  private requireCatalog(): ZCodeModelCatalog {
    if (!this.catalog) {
      throw new Error('ZCode model catalog unavailable: no session snapshot observed yet.');
    }
    return this.catalog;
  }
}
