import { setIcon } from 'obsidian';

import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import type { ClaudeCodePermissionMode } from '../../../core/types/settings';
import type { CodexSandboxMode } from '../../../core/types/settings';
import type { PermissionMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import { AnchoredOverlayLayoutController } from '../ui/AnchoredOverlayLayoutController';
import { buildModelSelectorDisplayState } from '../ui/modelSelector/ModelSelectorDisplay';
import {
  highlightModelOption as highlightRenderedModelOption,
  navigateModelList as navigateRenderedModelList,
  scrollToCurrentModel as scrollRenderedCurrentModel,
  selectHighlightedModel as selectRenderedHighlightedModel,
} from '../ui/modelSelector/ModelSelectorInteractions';
import { renderModelList as renderModelSelectorList } from '../ui/modelSelector/ModelSelectorRenderer';
import type {
  ModelSelectorKnownModelInfo,
  ModelSelectorProvider,
  ModelSelectorSelection,
} from '../ui/modelSelector/types';
import { AdditionalDirectoriesConfigBadgeCoordinator } from './AdditionalDirectoriesConfigBadgeCoordinator';
import { CodexRuntimeDefaultsBadgeCoordinator } from './CodexRuntimeDefaultsBadgeCoordinator';
import {
  ModelSelectionRuntime,
  type ModelSelectionRuntimeHost,
  type ModelUnavailableNoticeContent,
} from './ModelSelectionRuntime';
import {
  createClaudeCodePermissionConfig,
  createCodexSandboxConfig,
  createOpenCodePermissionConfig,
  PermissionModeSelectorCoordinator,
} from './PermissionModeSelectorCoordinator';
import { SandboxConfigBadgeCoordinator } from './SandboxConfigBadgeCoordinator';

export interface ChatSelectionControlsCoordinatorHost extends ModelSelectionRuntimeHost {
  registerEscapeHandler(handler: () => boolean): void;
  resolveProviderIconUrl(providerId: string): Promise<string | null>;
  updateEffortSelectorDisplay(): void;
  /** OpenCode permission template mode (yolo/normal/plan). */
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<void>;
}

const MODEL_SEARCH_PLACEHOLDER = 'Search models...';
const MODEL_DROPDOWN_PREFERRED_WIDTH = 340;
const MODEL_DROPDOWN_MINIMUM_WIDTH = 280;
const MODEL_DROPDOWN_SAFE_INSET = 8;
const CLAUDE_CODE_PERMISSION_MODES: readonly ClaudeCodePermissionMode[] = [
  'default', 'acceptEdits', 'bypassPermissions', 'plan',
];

interface LiveOpenCodianPlugin {
  settings?: {
    activeBackend?: string;
    backendSettings?: {
      claudeCode?: { permissionMode?: ClaudeCodePermissionMode };
      codex?: { sandboxMode?: CodexSandboxMode };
    };
  };
  saveSettings?: () => Promise<void>;
  agentServiceRegistry?: { get?: (backend: string) => unknown };
}

/**
 * Read the live plugin instance from Obsidian globals. This keeps backend-aware
 * permission UI ownership inside this selector coordinator instead of adding
 * new runtime ownership to the guarded OpenCodianView.ts shell.
 */
function readOpenCodianPlugin(): LiveOpenCodianPlugin | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).app?.plugins?.plugins?.opencodian ?? null;
  } catch {
    return null;
  }
}

function readActiveBackendFromPlugin(): string {
  return readOpenCodianPlugin()?.settings?.activeBackend ?? 'opencode';
}

function normalizeClaudeCodePermissionMode(value: ClaudeCodePermissionMode | undefined): ClaudeCodePermissionMode {
  return value && CLAUDE_CODE_PERMISSION_MODES.includes(value)
    ? value
    : 'default';
}

function readClaudeCodePermissionModeFromPlugin(): ClaudeCodePermissionMode {
  return normalizeClaudeCodePermissionMode(
    readOpenCodianPlugin()?.settings?.backendSettings?.claudeCode?.permissionMode,
  );
}

async function switchClaudeCodePermissionModeInPlugin(mode: ClaudeCodePermissionMode): Promise<void> {
  const plugin = readOpenCodianPlugin();
  const claudeSettings = plugin?.settings?.backendSettings?.claudeCode;
  if (!plugin || !claudeSettings) {
    return;
  }

  claudeSettings.permissionMode = mode;
  await plugin.saveSettings?.();

  const adapter = plugin.agentServiceRegistry?.get?.('claude-code') as {
    setPermissionMode?: (nextMode: ClaudeCodePermissionMode) => Promise<void> | void;
  } | undefined;
  await adapter?.setPermissionMode?.(mode);
}

function readCodexSandboxModeFromPlugin(): CodexSandboxMode {
  const plugin = readOpenCodianPlugin();
  const codexSettings = plugin?.settings?.backendSettings?.codex;
  const mode = codexSettings?.sandboxMode;
  if (mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access') {
    return mode;
  }
  return 'workspace-write';
}

async function switchCodexSandboxModeInPlugin(mode: CodexSandboxMode): Promise<void> {
  const plugin = readOpenCodianPlugin();
  const codexSettings = plugin?.settings?.backendSettings?.codex;
  if (!plugin || !codexSettings) {
    return;
  }

  codexSettings.sandboxMode = mode;
  await plugin.saveSettings?.();

  // Push to live adapter so subsequent thread creation uses the new mode.
  const adapter = plugin.agentServiceRegistry?.get?.('codex') as {
    updateSandboxMode?: (m: CodexSandboxMode) => void;
  } | undefined;
  adapter?.updateSandboxMode?.(mode);
}

export class ChatSelectionControlsCoordinator {
  private toolbarEl: HTMLElement | null = null;
  private readonly modelSelectionRuntime: ModelSelectionRuntime;
  private permissionSelector: PermissionModeSelectorCoordinator | null = null;
  private readonly additionalDirectoriesBadge: AdditionalDirectoriesConfigBadgeCoordinator;
  private additionalDirectoriesBadgeContainer: HTMLElement | null = null;
  private readonly sandboxBadge: SandboxConfigBadgeCoordinator;
  private sandboxBadgeContainer: HTMLElement | null = null;
  private readonly codexRuntimeDefaultsBadge: CodexRuntimeDefaultsBadgeCoordinator;
  private codexRuntimeDefaultsBadgeContainer: HTMLElement | null = null;

  private modelSelectorContainer: HTMLElement | null = null;
  private modelSelectorTrigger: HTMLElement | null = null;
  private modelSelectorDropdown: HTMLElement | null = null;
  private modelSelectorSearchInput: HTMLInputElement | null = null;
  private modelSelectorScrollContainer: HTMLElement | null = null;
  private disposeModelSelectorStickyHeaders: (() => void) | null = null;
  private isModelDropdownOpen = false;
  private modelFilterQuery = '';
  private modelDropdownClickOutsideHandler: ((event: MouseEvent) => void) | null = null;
  private currentModelTriggerIconUrl: string | null = null;
  private modelSelectorIconRequestId = 0;
  private modelDropdownLayoutController: AnchoredOverlayLayoutController | null = null;

  private hasRegisteredEscapeHandler = false;

  constructor(
    private readonly host: ChatSelectionControlsCoordinatorHost,
  ) {
    this.modelSelectionRuntime = new ModelSelectionRuntime(host);
    // Permission selector is created per-build in buildBackendPermissionSelector()
    // because the mode system depends on the active backend.
    this.additionalDirectoriesBadge = new AdditionalDirectoriesConfigBadgeCoordinator();
    // Sandbox badge reads settings directly from the plugin instance,
    // avoiding coupling to the guarded OpenCodianView.ts host object.
    this.sandboxBadge = new SandboxConfigBadgeCoordinator();
    this.codexRuntimeDefaultsBadge = new CodexRuntimeDefaultsBadgeCoordinator();
  }

  build(toolbarEl: HTMLElement, options?: { showModels?: boolean; showPermissions?: boolean }): void {
    this.destroy();
    this.toolbarEl = toolbarEl;
    this.registerEscapeHandler();

    const showModels = options?.showModels !== false;
    const showPermissions = options?.showPermissions !== false;

    if (showPermissions) {
      this.buildBackendPermissionSelector(toolbarEl.createDiv({ cls: 'opencodian-permission-selector' }));
    }
    if (showModels) {
      this.mountModelSelector(toolbarEl.createDiv({ cls: 'opencodian-model-selector' }));
    }
    // Sandbox badge: self-gated by active backend.
    // syncSandboxBadge() reads the current backend from the plugin instance
    // on every refresh, so hot-switching backends within a live UI correctly
    // shows or hides the badge without a full rebuild.
    this.syncAdditionalDirectoriesBadge();
    this.syncSandboxBadge();
    this.syncCodexRuntimeDefaultsBadge();
  }

  async reloadModelCatalog(): Promise<void> {
    await this.modelSelectionRuntime.reloadModelCatalog();
    this.refreshModelOptions();
    this.updateModelSelectorDisplay();
  }

  hasLoadedModelCatalog(): boolean {
    return this.modelSelectionRuntime.hasLoadedModelCatalog();
  }

  getAvailableProviders(): readonly ModelSelectorProvider[] {
    return this.modelSelectionRuntime.getAvailableProviders();
  }

  getCurrentSessionModel(): ModelSelectorSelection | null {
    return this.modelSelectionRuntime.getCurrentSessionModel();
  }

  getCurrentSessionModelResolution(): ResolvedModelSelection {
    return this.modelSelectionRuntime.getCurrentSessionModelResolution();
  }

  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null {
    return this.modelSelectionRuntime.findKnownModelInfo(selection);
  }

  formatModelId(
    model: Partial<ModelSelectorSelection> | null | undefined,
  ): string | undefined {
    return this.modelSelectionRuntime.formatModelId(model);
  }

  async ensureSelectedModelAvailable(
    provider: string | undefined,
    model: string | undefined,
  ): Promise<boolean> {
    if (!this.modelSelectionRuntime.hasLoadedModelCatalog()) {
      await this.reloadModelCatalog();
    }

    return this.modelSelectionRuntime.ensureSelectedModelAvailable(provider, model);
  }

  getModelUnavailableNoticeContent(): ModelUnavailableNoticeContent {
    return this.modelSelectionRuntime.getModelUnavailableNoticeContent();
  }

  refreshModelOptions(): void {
    this.renderModelList();
  }

  updateModelSelectorDisplay(): void {
    if (!this.modelSelectorTrigger) {
      return;
    }

    const current = this.getCurrentSessionModel();
    const resolution = this.getCurrentSessionModelResolution();
    const modelInfo = this.findKnownModelInfo(current);
    const displayState = buildModelSelectorDisplayState({
      currentSelection: current,
      resolution,
      knownModelInfo: modelInfo,
      hasLoadedModelCatalog: this.hasLoadedModelCatalog(),
      availableProviderCount: this.getAvailableProviders().length,
      unavailableTitle: this.getModelUnavailableNoticeContent().message,
      unconfiguredLabel: t('settings.model.unconfigured'),
    });

    this.modelSelectorTrigger.toggleClass('is-unavailable', displayState.isUnavailable);
    this.modelSelectorTrigger.toggleClass('is-unconfigured', displayState.isUnconfigured);

    const textEl = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-text');
    if (textEl) {
      textEl.textContent = displayState.text;
    }

    this.modelSelectorTrigger.setAttribute(
      'title',
      t('chat.modelSelector.currentTabOverrideTitle', { model: displayState.title }),
    );
    void this.updateModelSelectorIcon(current?.provider ?? null, displayState.iconLabel);
    this.host.updateEffortSelectorDisplay();
  }

  updatePermissionTriggerDisplay(): void {
    this.permissionSelector?.updateTriggerDisplay();
    this.syncAdditionalDirectoriesBadge();
    this.syncSandboxBadge();
    this.syncCodexRuntimeDefaultsBadge();
  }

  applyLocaleTexts(): void {
    this.modelSelectorSearchInput?.setAttribute('placeholder', MODEL_SEARCH_PLACEHOLDER);
    this.refreshModelOptions();
    this.updateModelSelectorDisplay();
    this.permissionSelector?.applyLocaleTexts();
    this.syncAdditionalDirectoriesBadge();
    this.syncSandboxBadge();
    this.syncCodexRuntimeDefaultsBadge();
  }

  destroy(): void {
    this.closeModelDropdown();
    this.permissionSelector?.destroy();
    this.permissionSelector = null;
    this.additionalDirectoriesBadge.destroy();
    this.additionalDirectoriesBadgeContainer = null;
    this.sandboxBadge.destroy();
    this.sandboxBadgeContainer = null;
    this.codexRuntimeDefaultsBadge.destroy();
    this.codexRuntimeDefaultsBadgeContainer = null;
    this.disposeModelSelectorStickyHeaders?.();
    this.disposeModelSelectorStickyHeaders = null;
    this.modelDropdownLayoutController?.destroy();
    this.modelDropdownLayoutController = null;
    this.toolbarEl = null;
    this.modelSelectorContainer = null;
    this.modelSelectorTrigger = null;
    this.modelSelectorDropdown = null;
    this.modelSelectorSearchInput = null;
    this.modelSelectorScrollContainer = null;
    this.modelFilterQuery = '';
    this.modelSelectionRuntime.reset();
    this.currentModelTriggerIconUrl = null;
    this.modelSelectorIconRequestId += 1;
  }

  private syncAdditionalDirectoriesBadge(): void {
    if (!this.toolbarEl) {
      return;
    }

    const isClaudeCode = readActiveBackendFromPlugin() === 'claude-code';

    if (isClaudeCode) {
      if (!this.additionalDirectoriesBadgeContainer) {
        this.additionalDirectoriesBadgeContainer = this.toolbarEl.createDiv({
          cls: 'opencodian-additional-directories-badge-container',
        });
        this.additionalDirectoriesBadge.mount(this.additionalDirectoriesBadgeContainer);
      } else {
        this.additionalDirectoriesBadge.update();
      }

      if (!this.additionalDirectoriesBadgeContainer.querySelector('.opencodian-additional-directories-config-badge')) {
        this.additionalDirectoriesBadge.destroy();
        this.additionalDirectoriesBadgeContainer.remove();
        this.additionalDirectoriesBadgeContainer = null;
      }
      return;
    }

    if (this.additionalDirectoriesBadgeContainer) {
      this.additionalDirectoriesBadge.destroy();
      this.additionalDirectoriesBadgeContainer.remove();
      this.additionalDirectoriesBadgeContainer = null;
    }
  }

  /**
   * Synchronize the sandbox badge container with the current active backend.
   *
   * On every refresh (build, updatePermissionTriggerDisplay, applyLocaleTexts),
   * this re-reads the active backend from the live plugin settings:
   * - claude-code + no container → mount badge
   * - claude-code + existing container → update badge content
   * - other backend + existing container → remove badge and container
   * - other backend + no container → noop
   *
   * This ensures backend hot-switches within a live UI surface the correct
   * badge state without requiring a full toolbar rebuild.
   */
  private syncSandboxBadge(): void {
    if (!this.toolbarEl) {
      return;
    }

    const isClaudeCode = readActiveBackendFromPlugin() === 'claude-code';

    if (isClaudeCode) {
      if (!this.sandboxBadgeContainer) {
        this.sandboxBadgeContainer = this.toolbarEl.createDiv({ cls: 'opencodian-sandbox-badge-container' });
        this.sandboxBadge.mount(this.sandboxBadgeContainer);
      } else {
        this.sandboxBadge.update();
      }
    } else {
      if (this.sandboxBadgeContainer) {
        this.sandboxBadge.destroy();
        this.sandboxBadgeContainer.remove();
        this.sandboxBadgeContainer = null;
      }
    }
  }

  /**
   * Synchronize the Codex runtime defaults badge container with the current
   * active backend.
   *
   * On every refresh (build, updatePermissionTriggerDisplay, applyLocaleTexts),
   * this re-reads the active backend from the live plugin settings:
   * - codex + no container → mount badge
   * - codex + existing container → update badge content
   * - other backend + existing container → remove badge and container
   * - other backend + no container → noop
   *
   * The badge itself is quiet and renders nothing when all Codex defaults are
   * at their default values, so the container may appear empty until the user
   * enables network access, web search, or extra directories.
   */
  private syncCodexRuntimeDefaultsBadge(): void {
    if (!this.toolbarEl) {
      return;
    }

    const isCodex = readActiveBackendFromPlugin() === 'codex';

    if (isCodex) {
      if (!this.codexRuntimeDefaultsBadgeContainer) {
        this.codexRuntimeDefaultsBadgeContainer = this.toolbarEl.createDiv({
          cls: 'opencodian-codex-runtime-defaults-badge-container',
        });
        this.codexRuntimeDefaultsBadge.mount(this.codexRuntimeDefaultsBadgeContainer);
      } else {
        this.codexRuntimeDefaultsBadge.update();
      }

      if (!this.codexRuntimeDefaultsBadgeContainer.querySelector('.opencodian-codex-runtime-defaults-badge')) {
        this.codexRuntimeDefaultsBadge.destroy();
        this.codexRuntimeDefaultsBadgeContainer.remove();
        this.codexRuntimeDefaultsBadgeContainer = null;
      }
    } else {
      if (this.codexRuntimeDefaultsBadgeContainer) {
        this.codexRuntimeDefaultsBadge.destroy();
        this.codexRuntimeDefaultsBadgeContainer.remove();
        this.codexRuntimeDefaultsBadgeContainer = null;
      }
    }
  }

  private registerEscapeHandler(): void {
    if (this.hasRegisteredEscapeHandler) {
      return;
    }

    this.hasRegisteredEscapeHandler = true;
    this.host.registerEscapeHandler(() => {
      if (!this.isModelDropdownOpen && !(this.permissionSelector?.isOpen() ?? false)) {
        return false;
      }

      this.closeModelDropdown();
      this.permissionSelector?.closeDropdown();
      return true;
    });
  }

  private mountModelSelector(containerEl: HTMLElement): void {
    this.modelSelectorContainer = containerEl;
    this.modelSelectorTrigger = containerEl.createDiv({
      cls: 'opencodian-model-trigger',
      attr: {
        role: 'button',
        tabindex: '0',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
      },
    });
    const triggerContent = this.modelSelectorTrigger.createDiv({ cls: 'opencodian-model-trigger-content' });

    const iconWrapper = triggerContent.createSpan({ cls: 'opencodian-model-trigger-icon' });
    setIcon(iconWrapper, 'bot');
    triggerContent.createSpan({ cls: 'opencodian-model-trigger-text' });

    this.modelSelectorDropdown = containerEl.createDiv({ cls: 'opencodian-model-dropdown' });
    this.modelSelectorDropdown.style.display = 'none';
    this.buildModelDropdown();
    this.mountModelDropdownLayoutController();

    void this.reloadModelCatalog();
    this.updateModelSelectorDisplay();

    this.modelSelectorTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleModelDropdown();
    });

    this.modelDropdownClickOutsideHandler = (event: MouseEvent) => {
      if (!this.modelSelectorContainer?.contains(event.target as Node)) {
        this.closeModelDropdown();
      }
    };
  }

  private buildModelDropdown(): void {
    if (!this.modelSelectorDropdown) {
      return;
    }

    this.modelSelectorDropdown.empty();

    const searchWrapper = this.modelSelectorDropdown.createDiv({ cls: 'opencodian-model-dropdown-search' });
    const searchContainer = searchWrapper.createDiv({ cls: 'opencodian-model-dropdown-search-container' });
    const searchIcon = searchContainer.createSpan({ cls: 'opencodian-model-dropdown-search-icon' });
    setIcon(searchIcon, 'search');

    this.modelSelectorSearchInput = searchContainer.createEl('input', {
      cls: 'opencodian-model-dropdown-search-input',
      attr: {
        type: 'text',
        placeholder: MODEL_SEARCH_PLACEHOLDER,
      },
    });

    this.modelSelectorSearchInput.addEventListener('input', (event) => {
      this.modelFilterQuery = (event.target as HTMLInputElement).value.toLowerCase();
      this.renderModelList();
    });

    this.modelSelectorSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeModelDropdown();
        event.preventDefault();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        this.navigateModelList(event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
      } else if (event.key === 'Enter') {
        this.selectHighlightedModel();
        event.preventDefault();
      }
    });

    this.modelSelectorScrollContainer = this.modelSelectorDropdown.createDiv({
      cls: 'opencodian-model-dropdown-scroll',
    });

    this.renderModelList();
  }

  private mountModelDropdownLayoutController(): void {
    this.modelDropdownLayoutController?.destroy();
    this.modelDropdownLayoutController = null;
    if (!this.modelSelectorContainer || !this.modelSelectorDropdown) {
      return;
    }

    this.modelDropdownLayoutController = new AnchoredOverlayLayoutController({
      anchorEl: this.modelSelectorContainer,
      overlayEl: this.modelSelectorDropdown,
      resolveBoundary: () => this.modelSelectorContainer?.closest<HTMLElement>('.opencodian-container') ?? null,
      alignment: 'start',
      preferredWidth: MODEL_DROPDOWN_PREFERRED_WIDTH,
      minimumWidth: MODEL_DROPDOWN_MINIMUM_WIDTH,
      safeInset: MODEL_DROPDOWN_SAFE_INSET,
      isOpen: () => this.isModelDropdownOpen,
    });
    this.modelDropdownLayoutController.observe();
  }

  private toggleModelDropdown(): void {
    if (this.isModelDropdownOpen) {
      this.closeModelDropdown();
    } else {
      this.openModelDropdown();
    }
  }

  private openModelDropdown(): void {
    if (!this.modelSelectorDropdown || !this.modelSelectorTrigger) {
      return;
    }

    this.permissionSelector?.closeDropdown();
    this.isModelDropdownOpen = true;
    this.modelSelectorDropdown.style.display = 'block';
    this.modelDropdownLayoutController?.observe();
    this.modelDropdownLayoutController?.sync();
    this.modelSelectorDropdown.addClass('is-open');
    this.modelSelectorTrigger.addClass('is-open');
    this.modelSelectorTrigger.setAttribute('aria-expanded', 'true');

    this.modelFilterQuery = '';
    if (this.modelSelectorSearchInput) {
      this.modelSelectorSearchInput.value = '';
    }
    this.renderModelList();

    window.setTimeout(() => {
      this.modelSelectorSearchInput?.focus();
      this.scrollToCurrentModel();
    }, 0);

    if (this.modelDropdownClickOutsideHandler) {
      document.addEventListener('click', this.modelDropdownClickOutsideHandler, true);
    }
  }

  private closeModelDropdown(): void {
    this.isModelDropdownOpen = false;
    if (this.modelSelectorDropdown) {
      this.modelSelectorDropdown.removeClass('is-open');
      this.modelSelectorDropdown.style.display = 'none';
    }
    this.modelSelectorTrigger?.removeClass('is-open');
    this.modelSelectorTrigger?.setAttribute('aria-expanded', 'false');

    if (this.modelDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.modelDropdownClickOutsideHandler, true);
    }
  }

  private renderModelList(): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    const highlightedValue = this.modelSelectorScrollContainer
      .querySelector<HTMLElement>('.opencodian-model-option.is-highlighted')
      ?.dataset.value ?? null;

    const renderResult = renderModelSelectorList({
      scrollContainer: this.modelSelectorScrollContainer,
      providers: this.getAvailableProviders(),
      hasLoadedModelCatalog: this.hasLoadedModelCatalog(),
      filterQuery: this.modelFilterQuery,
      currentSelection: this.getCurrentSessionModel(),
      highlightedValue,
      previousStickyHeadersCleanup: this.disposeModelSelectorStickyHeaders,
      texts: {
        loading: 'Loading models...',
        noModels: t('settings.model.noModels'),
        noModelsFound: 'No models found',
        noModelsAvailable: 'No models available',
        configuredOnlyBadge: t('chat.modelSelector.configuredOnlyBadge'),
        configuredOnlyTitle: t('chat.modelSelector.configuredOnlyTitle'),
      },
      onSelect: (provider, model) => {
        this.selectModel(provider, model);
        this.closeModelDropdown();
      },
      onHighlight: (value) => {
        this.highlightModelOption(value);
      },
    });

    this.disposeModelSelectorStickyHeaders = renderResult.disposeStickyHeaders;
  }

  private navigateModelList(direction: 1 | -1): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    navigateRenderedModelList(this.modelSelectorScrollContainer, direction);
  }

  private highlightModelOption(value: string): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    highlightRenderedModelOption(this.modelSelectorScrollContainer, value);
  }

  private selectHighlightedModel(): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    const didSelect = selectRenderedHighlightedModel(
      this.modelSelectorScrollContainer,
      (provider, model) => {
        this.selectModel(provider, model);
      },
    );
    if (didSelect) {
      this.closeModelDropdown();
    }
  }

  private scrollToCurrentModel(): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    scrollRenderedCurrentModel(this.modelSelectorScrollContainer, this.getCurrentSessionModel());
  }

  private selectModel(provider: string, model: string): void {
    this.modelSelectionRuntime.switchModel(provider, model);
    this.updateModelSelectorDisplay();
  }

  private async updateModelSelectorIcon(providerId: string | null, iconLabel: string): Promise<void> {
    if (!this.modelSelectorTrigger) {
      return;
    }

    const iconWrapper = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-icon');
    if (!iconWrapper) {
      return;
    }

    const requestId = ++this.modelSelectorIconRequestId;

    if (!providerId) {
      iconWrapper.empty();
      setIcon(iconWrapper as HTMLElement, 'bot');
      this.currentModelTriggerIconUrl = null;
      return;
    }

    const iconUrl = await this.host.resolveProviderIconUrl(providerId);
    if (requestId !== this.modelSelectorIconRequestId) {
      return;
    }

    if (iconUrl !== this.currentModelTriggerIconUrl) {
      iconWrapper.empty();

      if (iconUrl) {
        const img = document.createElement('img');
        img.classList.add('opencodian-provider-icon-image');
        img.src = iconUrl;
        img.alt = iconLabel;
        img.title = iconLabel;
        iconWrapper.appendChild(img);
      } else {
        setIcon(iconWrapper as HTMLElement, 'bot');
      }

      this.currentModelTriggerIconUrl = iconUrl;
      return;
    }

    if (iconUrl) {
      const existingImg = iconWrapper.querySelector('img');
      if (existingImg) {
        existingImg.alt = iconLabel;
        existingImg.title = iconLabel;
      }
    }
  }

  /**
   * Create and mount the backend-appropriate permission selector.
   *
   * - claude-code → Claude Code permission modes (default/acceptEdits/bypassPermissions/plan),
   *   routed through the live plugin settings + adapter.setPermissionMode() seam.
   * - codex → Codex sandbox modes (read-only/workspace-write/danger-full-access),
   *   routed through the live plugin settings + adapter.updateSandboxMode() seam.
   *   Boundary hint: only affects subsequent thread creation/resume.
   * - opencode (default) → OpenCode permission templates (yolo/normal/plan),
   *   routed through host.getPermissionMode() / switchPermissionMode().
   *
   * The toolbar is fully rebuilt on backend switch, so this is called once per
   * build() invocation with the correct backend active.
   */
  private buildBackendPermissionSelector(containerEl: HTMLElement): void {
    const activeBackend = readActiveBackendFromPlugin();

    if (activeBackend === 'claude-code') {
      const permissionConfig = createClaudeCodePermissionConfig();
      this.permissionSelector = new PermissionModeSelectorCoordinator(
        {
          getPermissionMode: () => readClaudeCodePermissionModeFromPlugin(),
          switchPermissionMode: (mode) => switchClaudeCodePermissionModeInPlugin(mode as ClaudeCodePermissionMode),
        },
        permissionConfig,
      );
    } else if (activeBackend === 'codex') {
      const sandboxConfig = createCodexSandboxConfig();
      this.permissionSelector = new PermissionModeSelectorCoordinator(
        {
          getPermissionMode: () => readCodexSandboxModeFromPlugin(),
          switchPermissionMode: (mode) => switchCodexSandboxModeInPlugin(mode as CodexSandboxMode),
        },
        sandboxConfig,
      );
    } else {
      const permissionConfig = createOpenCodePermissionConfig();
      this.permissionSelector = new PermissionModeSelectorCoordinator(
        {
          getPermissionMode: () => this.host.getPermissionMode(),
          switchPermissionMode: (mode) => this.host.switchPermissionMode(mode as PermissionMode),
        },
        permissionConfig,
      );
    }

    this.permissionSelector.mount(containerEl);
  }
}
