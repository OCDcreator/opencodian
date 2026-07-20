import { setIcon } from 'obsidian';

import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import type { ClaudeCodePermissionMode } from '../../../core/types/settings';
import type { CodexSandboxMode } from '../../../core/types/settings';
import type { PermissionMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import { AnchoredOverlayLayoutController } from '../ui/AnchoredOverlayLayoutController';
import {
  type ComposerPopoverFrameHandle,
  type ComposerPopoverFrameTexts,
  mountComposerPopoverFrame,
} from '../ui/ComposerPopoverFrame';
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
  restoreComposerInputFocus(): void;
  /** OpenCode permission template mode (yolo/normal/plan). */
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<boolean>;
}

const MODEL_DROPDOWN_PREFERRED_WIDTH = 340;
const MODEL_DROPDOWN_MINIMUM_WIDTH = 280;
const MODEL_DROPDOWN_SAFE_INSET = 8;
let modelSelectorInstanceSequence = 0;
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

async function switchClaudeCodePermissionModeInPlugin(mode: ClaudeCodePermissionMode): Promise<boolean> {
  const plugin = readOpenCodianPlugin();
  const claudeSettings = plugin?.settings?.backendSettings?.claudeCode;
  if (!plugin || !claudeSettings) {
    return false;
  }

  const previousMode = normalizeClaudeCodePermissionMode(claudeSettings.permissionMode);
  try {
    claudeSettings.permissionMode = mode;
    await plugin.saveSettings?.();

    const adapter = plugin.agentServiceRegistry?.get?.('claude-code') as {
      setPermissionMode?: (nextMode: ClaudeCodePermissionMode) => Promise<void> | void;
    } | undefined;
    await adapter?.setPermissionMode?.(mode);
    return true;
  } catch {
    claudeSettings.permissionMode = previousMode;
    await plugin.saveSettings?.().catch(() => undefined);
    return false;
  }
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

async function switchCodexSandboxModeInPlugin(mode: CodexSandboxMode): Promise<boolean> {
  const plugin = readOpenCodianPlugin();
  const codexSettings = plugin?.settings?.backendSettings?.codex;
  if (!plugin || !codexSettings) {
    return false;
  }

  const previousMode = readCodexSandboxModeFromPlugin();
  try {
    codexSettings.sandboxMode = mode;
    await plugin.saveSettings?.();

    // Push to live adapter so subsequent thread creation uses the new mode.
    const adapter = plugin.agentServiceRegistry?.get?.('codex') as {
      updateSandboxMode?: (m: CodexSandboxMode) => void;
    } | undefined;
    adapter?.updateSandboxMode?.(mode);
    return true;
  } catch {
    codexSettings.sandboxMode = previousMode;
    await plugin.saveSettings?.().catch(() => undefined);
    return false;
  }
}

export class ChatSelectionControlsCoordinator {
  private toolbarEl: HTMLElement | null = null;
  private readonly modelSelectionRuntime: ModelSelectionRuntime;
  private readonly modelSelectorInstanceId = 'opencodian-model-selector-' + modelSelectorInstanceSequence++;
  private permissionSelector: PermissionModeSelectorCoordinator | null = null;
  private readonly additionalDirectoriesBadge: AdditionalDirectoriesConfigBadgeCoordinator;
  private additionalDirectoriesBadgeContainer: HTMLElement | null = null;
  private readonly sandboxBadge: SandboxConfigBadgeCoordinator;
  private sandboxBadgeContainer: HTMLElement | null = null;
  private readonly codexRuntimeDefaultsBadge: CodexRuntimeDefaultsBadgeCoordinator;
  private codexRuntimeDefaultsBadgeContainer: HTMLElement | null = null;
  private runtimeOverflowEl: HTMLElement | null = null;
  private runtimeOverflowTriggerEl: HTMLButtonElement | null = null;
  private runtimeOverflowPanelEl: HTMLElement | null = null;
  private runtimeOverflowClickOutsideHandler: ((event: MouseEvent) => void) | null = null;
  private isRuntimeOverflowOpen = false;

  private modelSelectorContainer: HTMLElement | null = null;
  private modelSelectorTrigger: HTMLElement | null = null;
  private modelSelectorDropdown: HTMLElement | null = null;
  private modelPopoverFrame: ComposerPopoverFrameHandle | null = null;
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
    this.modelPopoverFrame?.refresh(this.getModelPopoverFrameTexts());
    this.modelSelectorSearchInput?.setAttribute('placeholder', t('chat.composerPopover.modelSearchPlaceholder'));
    this.refreshModelOptions();
    this.updateModelSelectorDisplay();
    this.permissionSelector?.applyLocaleTexts();
    this.syncAdditionalDirectoriesBadge();
    this.syncSandboxBadge();
    this.syncCodexRuntimeDefaultsBadge();
  }

  destroy(): void {
    this.closeModelDropdown();
    this.destroyRuntimeOverflow();
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
    this.modelPopoverFrame = null;
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
        const overflowPanel = this.ensureRuntimeOverflowPanel();
        if (!overflowPanel) {
          return;
        }
        this.additionalDirectoriesBadgeContainer = overflowPanel.createDiv({
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
      this.syncRuntimeOverflowVisibility();
      return;
    }

    if (this.additionalDirectoriesBadgeContainer) {
      this.additionalDirectoriesBadge.destroy();
      this.additionalDirectoriesBadgeContainer.remove();
      this.additionalDirectoriesBadgeContainer = null;
    }
    this.syncRuntimeOverflowVisibility();
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
        const overflowPanel = this.ensureRuntimeOverflowPanel();
        if (!overflowPanel) {
          return;
        }
        this.sandboxBadgeContainer = overflowPanel.createDiv({ cls: 'opencodian-sandbox-badge-container' });
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
    this.syncRuntimeOverflowVisibility();
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
        const overflowPanel = this.ensureRuntimeOverflowPanel();
        if (!overflowPanel) {
          return;
        }
        this.codexRuntimeDefaultsBadgeContainer = overflowPanel.createDiv({
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
    this.syncRuntimeOverflowVisibility();
  }

  private ensureRuntimeOverflowPanel(): HTMLElement | null {
    if (!this.toolbarEl) {
      return null;
    }

    if (this.runtimeOverflowPanelEl?.isConnected) {
      return this.runtimeOverflowPanelEl;
    }

    this.runtimeOverflowEl = this.toolbarEl.createDiv({ cls: 'opencodian-runtime-overflow' });
    this.runtimeOverflowTriggerEl = this.runtimeOverflowEl.createEl('button', {
      cls: 'opencodian-runtime-overflow-trigger',
      text: '⋯',
      attr: {
        type: 'button',
        'aria-label': t('chat.action.showMore'),
        'aria-expanded': 'false',
        'aria-haspopup': 'menu',
      },
    });
    this.runtimeOverflowPanelEl = this.runtimeOverflowEl.createDiv({
      cls: 'opencodian-runtime-overflow-panel',
      attr: { role: 'menu' },
    });

    this.runtimeOverflowTriggerEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleRuntimeOverflow();
    });

    this.runtimeOverflowClickOutsideHandler = (event: MouseEvent) => {
      if (!this.runtimeOverflowEl?.contains(event.target as Node)) {
        this.closeRuntimeOverflow();
      }
    };

    return this.runtimeOverflowPanelEl;
  }

  private syncRuntimeOverflowVisibility(): void {
    if (!this.runtimeOverflowEl || !this.runtimeOverflowPanelEl) {
      return;
    }

    const hasItems = Boolean(this.runtimeOverflowPanelEl.querySelector(
      [
        '.opencodian-sandbox-config-badge',
        '.opencodian-additional-directories-config-badge',
        '.opencodian-codex-runtime-defaults-badge',
      ].join(', '),
    ));

    if (hasItems) {
      return;
    }

    this.destroyRuntimeOverflow();
  }

  private toggleRuntimeOverflow(): void {
    if (this.isRuntimeOverflowOpen) {
      this.closeRuntimeOverflow();
      return;
    }

    this.openRuntimeOverflow();
  }

  private openRuntimeOverflow(): void {
    if (!this.runtimeOverflowEl || !this.runtimeOverflowPanelEl || !this.runtimeOverflowTriggerEl) {
      return;
    }

    this.closeModelDropdown();
    this.permissionSelector?.closeDropdown();
    this.isRuntimeOverflowOpen = true;
    this.runtimeOverflowEl.addClass('is-open');
    this.runtimeOverflowPanelEl.addClass('is-open');
    this.runtimeOverflowTriggerEl.addClass('is-open');
    this.runtimeOverflowTriggerEl.setAttribute('aria-expanded', 'true');

    if (this.runtimeOverflowClickOutsideHandler) {
      document.addEventListener('click', this.runtimeOverflowClickOutsideHandler, true);
    }
  }

  private closeRuntimeOverflow(): void {
    this.isRuntimeOverflowOpen = false;
    this.runtimeOverflowEl?.removeClass('is-open');
    this.runtimeOverflowPanelEl?.removeClass('is-open');
    this.runtimeOverflowTriggerEl?.removeClass('is-open');
    this.runtimeOverflowTriggerEl?.setAttribute('aria-expanded', 'false');

    if (this.runtimeOverflowClickOutsideHandler) {
      document.removeEventListener('click', this.runtimeOverflowClickOutsideHandler, true);
    }
  }

  private destroyRuntimeOverflow(): void {
    this.closeRuntimeOverflow();
    this.runtimeOverflowEl?.remove();
    this.runtimeOverflowEl = null;
    this.runtimeOverflowTriggerEl = null;
    this.runtimeOverflowPanelEl = null;
    this.runtimeOverflowClickOutsideHandler = null;
    this.additionalDirectoriesBadge.destroy();
    this.additionalDirectoriesBadgeContainer = null;
    this.sandboxBadge.destroy();
    this.sandboxBadgeContainer = null;
    this.codexRuntimeDefaultsBadge.destroy();
    this.codexRuntimeDefaultsBadgeContainer = null;
  }

  private registerEscapeHandler(): void {
    if (this.hasRegisteredEscapeHandler) {
      return;
    }

    this.hasRegisteredEscapeHandler = true;
    this.host.registerEscapeHandler(() => {
      if (this.isModelDropdownOpen) {
        this.closeModelDropdown({ restoreTriggerFocus: true });
        return true;
      }

      if (this.permissionSelector?.isOpen()) {
        this.permissionSelector.closeDropdown({ restoreTriggerFocus: true });
        return true;
      }

      if (this.isRuntimeOverflowOpen) {
        this.closeRuntimeOverflow();
        this.runtimeOverflowTriggerEl?.focus();
        return true;
      }

      return false;
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

    this.modelSelectorDropdown = containerEl.createDiv({
      cls: 'opencodian-model-dropdown',
    });
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
    this.modelPopoverFrame = mountComposerPopoverFrame(
      this.modelSelectorDropdown,
      this.getModelPopoverFrameTexts(),
    );

    const searchWrapper = this.modelPopoverFrame.contentEl.createDiv({ cls: 'opencodian-model-dropdown-search' });
    const searchContainer = searchWrapper.createDiv({ cls: 'opencodian-model-dropdown-search-container' });
    const searchIcon = searchContainer.createSpan({ cls: 'opencodian-model-dropdown-search-icon' });
    setIcon(searchIcon, 'search');

    this.modelSelectorSearchInput = searchContainer.createEl('input', {
      cls: 'opencodian-model-dropdown-search-input',
      attr: {
        type: 'text',
        placeholder: t('chat.composerPopover.modelSearchPlaceholder'),
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-controls': this.modelSelectorInstanceId + '-options',
        'aria-expanded': 'false',
      },
    });

    this.modelSelectorSearchInput.addEventListener('input', (event) => {
      this.modelFilterQuery = (event.target as HTMLInputElement).value.toLowerCase();
      this.renderModelList();
    });

    this.modelSelectorSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeModelDropdown({ restoreTriggerFocus: true });
        event.preventDefault();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        this.navigateModelList(event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
      } else if (event.key === 'Enter') {
        this.selectHighlightedModel();
        event.preventDefault();
      }
    });

    this.modelSelectorScrollContainer = this.modelPopoverFrame.contentEl.createDiv({
      cls: 'opencodian-model-dropdown-scroll',
      attr: {
        id: this.modelSelectorInstanceId + '-options',
        role: 'listbox',
        'aria-label': t('chat.composerPopover.modelTitle'),
      },
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
    this.closeRuntimeOverflow();
    this.isModelDropdownOpen = true;
    this.modelSelectorDropdown.style.display = 'block';
    this.modelDropdownLayoutController?.observe();
    this.modelDropdownLayoutController?.sync();
    this.modelSelectorDropdown.addClass('is-open');
    this.modelSelectorTrigger.addClass('is-open');
    this.modelSelectorTrigger.setAttribute('aria-expanded', 'true');
    this.modelSelectorSearchInput?.setAttribute('aria-expanded', 'true');

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

  private closeModelDropdown(options: { restoreTriggerFocus?: boolean } = {}): void {
    this.isModelDropdownOpen = false;
    if (this.modelSelectorDropdown) {
      this.modelSelectorDropdown.removeClass('is-open');
      this.modelSelectorDropdown.style.display = 'none';
    }
    this.modelSelectorTrigger?.removeClass('is-open');
    this.modelSelectorTrigger?.setAttribute('aria-expanded', 'false');
    this.modelSelectorSearchInput?.setAttribute('aria-expanded', 'false');
    this.modelSelectorSearchInput?.removeAttribute('aria-activedescendant');

    if (this.modelDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.modelDropdownClickOutsideHandler, true);
    }

    if (options.restoreTriggerFocus) {
      this.modelSelectorTrigger?.focus();
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
      optionIdPrefix: this.modelSelectorInstanceId + '-option',
      providers: this.getAvailableProviders(),
      hasLoadedModelCatalog: this.hasLoadedModelCatalog(),
      filterQuery: this.modelFilterQuery,
      currentSelection: this.getCurrentSessionModel(),
      highlightedValue,
      previousStickyHeadersCleanup: this.disposeModelSelectorStickyHeaders,
      texts: {
        loading: t('chat.composerPopover.modelLoading'),
        noModels: t('chat.composerPopover.modelNoModels'),
        noModelsFound: t('chat.composerPopover.modelNoResults'),
        noModelsAvailable: t('chat.composerPopover.modelNoModels'),
        configuredOnlyBadge: t('chat.modelSelector.configuredOnlyBadge'),
        configuredOnlyTitle: t('chat.modelSelector.configuredOnlyTitle'),
      },
      onSelect: (provider, model) => {
        if (this.selectModel(provider, model)) {
          this.closeModelDropdown();
          this.host.restoreComposerInputFocus();
        }
      },
      onHighlight: (value) => {
        this.highlightModelOption(value);
      },
    });

    this.disposeModelSelectorStickyHeaders = renderResult.disposeStickyHeaders;
    this.syncModelSearchActiveDescendant();
  }

  private navigateModelList(direction: 1 | -1): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    navigateRenderedModelList(this.modelSelectorScrollContainer, direction);
    this.syncModelSearchActiveDescendant();
  }

  private highlightModelOption(value: string): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    highlightRenderedModelOption(this.modelSelectorScrollContainer, value);
    this.syncModelSearchActiveDescendant();
  }

  private syncModelSearchActiveDescendant(): void {
    if (!this.isModelDropdownOpen) {
      this.modelSelectorSearchInput?.removeAttribute('aria-activedescendant');
      return;
    }

    const highlightedOption = this.modelSelectorScrollContainer
      ?.querySelector<HTMLElement>('.opencodian-model-option.is-highlighted');
    if (highlightedOption?.id) {
      this.modelSelectorSearchInput?.setAttribute('aria-activedescendant', highlightedOption.id);
    } else {
      this.modelSelectorSearchInput?.removeAttribute('aria-activedescendant');
    }
  }

  private selectHighlightedModel(): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    selectRenderedHighlightedModel(
      this.modelSelectorScrollContainer,
      (provider, model) => {
        if (this.selectModel(provider, model)) {
          this.closeModelDropdown();
          this.host.restoreComposerInputFocus();
        }
      },
    );
  }

  private scrollToCurrentModel(): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    scrollRenderedCurrentModel(this.modelSelectorScrollContainer, this.getCurrentSessionModel());
  }

  private selectModel(provider: string, model: string): boolean {
    const didSwitch = this.modelSelectionRuntime.switchModel(provider, model);
    if (!didSwitch) {
      return false;
    }
    this.updateModelSelectorDisplay();
    return true;
  }

  private getModelPopoverFrameTexts(): ComposerPopoverFrameTexts {
    return {
      title: t('chat.composerPopover.modelTitle'),
      escapeKey: 'Esc',
      navigateHint: t('chat.composerPopover.navigateHint'),
      selectHint: t('chat.composerPopover.selectHint'),
      closeHint: t('chat.composerPopover.closeHint'),
    };
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
          restoreInputFocus: () => this.host.restoreComposerInputFocus(),
        },
        permissionConfig,
      );
    } else if (activeBackend === 'codex') {
      const sandboxConfig = createCodexSandboxConfig();
      this.permissionSelector = new PermissionModeSelectorCoordinator(
        {
          getPermissionMode: () => readCodexSandboxModeFromPlugin(),
          switchPermissionMode: (mode) => switchCodexSandboxModeInPlugin(mode as CodexSandboxMode),
          restoreInputFocus: () => this.host.restoreComposerInputFocus(),
        },
        sandboxConfig,
      );
    } else {
      const permissionConfig = createOpenCodePermissionConfig();
      this.permissionSelector = new PermissionModeSelectorCoordinator(
        {
          getPermissionMode: () => this.host.getPermissionMode(),
          switchPermissionMode: (mode) => this.host.switchPermissionMode(mode as PermissionMode),
          restoreInputFocus: () => this.host.restoreComposerInputFocus(),
        },
        permissionConfig,
      );
    }

    this.permissionSelector.mount(containerEl);
  }
}
