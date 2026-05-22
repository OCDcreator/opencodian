/* eslint-disable max-lines -- Capability Lab owns diagnostic matrix, history browser, subagent browser, rewind preview, structured output playground, and discovery status for the same diagnostic boundary. */
/**
 * Capability Lab — diagnostic / experimental workbench for Claude Code SDK parity.
 *
 * All UI surfaces in this file are intentionally:
 *   - Read-only or dry-run only
 *   - Labelled ⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE
 *   - NOT connected to stable settings persistence
 *
 * See openspec/phase1-capability-lab.md for design rationale.
 */
import { Notice } from 'obsidian';

import { hasCapability } from '../../core/agents/AgentCapability';
import type { ClaudeCodeAdapter } from '../../core/agents/backend/ClaudeCodeAdapter';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';

const labLogger = createLogger('CapabilityLab');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapabilityLabDeps {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
}

interface MatrixRow {
  capability: string;
  sdkExposed: boolean;
  adapterWired: boolean;
  runtimeProof: 'untested' | 'pass' | 'fail';
  userSurface: 'settings' | 'diagnostic' | 'hidden';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClaudeCodeAdapter(plugin: OpenCodianPlugin): ClaudeCodeAdapter | null {
  const registry = plugin.agentServiceRegistry;
  if (!registry) return null;
  const adapter = registry.get('claude-code');
  if (!adapter) return null;
  // Narrow to ClaudeCodeAdapter — it's the only adapter that registers as 'claude-code'.
  return adapter as unknown as ClaudeCodeAdapter;
}

function experimentalBanner(containerEl: HTMLElement): void {
  const banner = containerEl.createDiv({
    cls: 'opencodian-capability-lab-banner',
    attr: { 'data-diagnostic': 'true' },
  });
  banner.createEl('strong', { text: '⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE' });
  banner.createEl('br');
  banner.createSpan({
    text: 'This panel exposes unverified SDK capabilities for diagnostic inspection only. ' +
      'Nothing here changes plugin behavior or persists settings. Do not rely on these features.',
  });
}

function createDiagnosticSummary(containerEl: HTMLElement): void {
  const summaryEl = containerEl.createDiv({
    cls: 'opencodian-capability-lab-summary',
    attr: { 'data-diagnostic': 'true' },
  });

  const items = [
    ['Boundary', 'Diagnostic only'],
    ['Runtime proof', 'Per-action, not persisted'],
    ['Writes', 'Read-only or dry-run'],
  ] as const;

  for (const [label, value] of items) {
    const itemEl = summaryEl.createDiv({ cls: 'opencodian-capability-lab-summary-item' });
    itemEl.createSpan({ cls: 'opencodian-capability-lab-summary-label', text: label });
    itemEl.createSpan({ cls: 'opencodian-capability-lab-summary-value', text: value });
  }
}

function createStatusChip(containerEl: HTMLElement, label: string, active: boolean): void {
  const chip = containerEl.createSpan({
    cls: `opencodian-capability-lab-chip${active ? ' opencodian-capability-lab-chip-active' : ''}`,
    text: active ? `✓ ${label}` : `✗ ${label}`,
  });
  chip.dataset.status = active ? 'active' : 'inactive';
}

function createSurfaceChip(containerEl: HTMLElement, surface: MatrixRow['userSurface']): void {
  const labels: Record<MatrixRow['userSurface'], string> = {
    settings: 'Settings',
    diagnostic: 'Diagnostic',
    hidden: 'Hidden',
  };
  const chip = containerEl.createSpan({
    cls: `opencodian-capability-lab-chip opencodian-capability-lab-chip-surface-${surface}`,
    text: labels[surface],
  });
  chip.dataset.surface = surface;
}

function formatJsonPreview(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ---------------------------------------------------------------------------
// Section class
// ---------------------------------------------------------------------------

export class SettingsCapabilityLabSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: CapabilityLabDeps['createSectionHeading'];

  constructor(deps: CapabilityLabDeps) {
    this.plugin = deps.plugin;
    this.createSectionHeading = deps.createSectionHeading;
  }

  dispose(): void {}

  attachTabbed(containerEl: HTMLElement, _secondaryTabId: string): void {
    this.createSectionHeading(
      containerEl,
      t('settings.capabilityLab.title'),
    );

    experimentalBanner(containerEl);
    createDiagnosticSummary(containerEl);

    // ── Capability Matrix ──────────────────────────────────────────────
    const matrixBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'matrix' },
    });
    this.renderCapabilityMatrix(matrixBlock);

    // ── JSONL History Browser (read-only) ──────────────────────────────
    const historyBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'history' },
    });
    this.renderHistoryBrowser(historyBlock);

    // ── Subagent Browser (read-only) ───────────────────────────────────
    const subagentBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'subagents' },
    });
    this.renderSubagentBrowser(subagentBlock);

    // ── Rewind Dry-Run Preview ────────────────────────────────────────
    const rewindBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'rewind' },
    });
    this.renderRewindDryRun(rewindBlock);

    // ── Structured Output Playground ───────────────────────────────────
    const structuredBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'structured' },
    });
    this.renderStructuredOutputPlayground(structuredBlock);

    // ── Discovery / Status ─────────────────────────────────────────────
    const discoveryBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'discovery' },
    });
    this.renderDiscoveryStatus(discoveryBlock);
  }

  // =======================================================================
  // Capability Matrix
  // =======================================================================

  private renderCapabilityMatrix(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: t('settings.capabilityLab.matrix.title') });
    containerEl.createEl('p', {
      cls: 'opencodian-capability-lab-description',
      text: t('settings.capabilityLab.matrix.description'),
    });

    const adapter = getClaudeCodeAdapter(this.plugin);
    const shellEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-table-shell',
      attr: { 'data-diagnostic': 'true' },
    });
    const table = shellEl.createEl('table', {
      cls: 'opencodian-capability-lab-matrix',
    });

    // Header
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'Capability' });
    headerRow.createEl('th', { text: 'SDK' });
    headerRow.createEl('th', { text: 'Adapter' });
    headerRow.createEl('th', { text: 'Runtime Proof' });
    headerRow.createEl('th', { text: 'User Surface' });

    // Build rows
    const rows = this.buildMatrixRows(adapter);
    const tbody = table.createEl('tbody');
    for (const row of rows) {
      const tr = tbody.createEl('tr');
      tr.createEl('td', { cls: 'opencodian-capability-lab-capability-cell', text: row.capability });
      const sdkCell = tr.createEl('td');
      createStatusChip(sdkCell, 'SDK', row.sdkExposed);
      const adapterCell = tr.createEl('td');
      createStatusChip(adapterCell, 'Adapter', row.adapterWired);
      const runtimeCell = tr.createEl('td');
      const proofLabel = row.runtimeProof === 'pass' ? 'Verified'
        : row.runtimeProof === 'fail' ? 'Failed'
        : 'Untested';
      runtimeCell.createSpan({
        cls: `opencodian-capability-lab-chip opencodian-capability-lab-chip-${row.runtimeProof}`,
        text: proofLabel,
      });
      const uiCell = tr.createEl('td');
      createSurfaceChip(uiCell, row.userSurface);
    }
  }

  private buildMatrixRows(adapter: ClaudeCodeAdapter | null): MatrixRow[] {
    // These are static assessments based on code inspection.
    // Runtime proof requires a live diagnostic call.
    return [
      {
        capability: 'Hooks',
        sdkExposed: true, // SDK options accept hooks
        adapterWired: true, // buildSdkOptions wires hooks
        runtimeProof: 'untested', // Requires diagnostic call
        userSurface: 'hidden', // No authoring UI
      },
      {
        capability: 'File Checkpoint / Rewind',
        sdkExposed: true, // enableFileCheckpointing option + rewindFiles on query
        adapterWired: true, // adapter.rewindFiles() exists
        runtimeProof: 'untested',
        userSurface: 'settings', // SDK Foundations toggle exists
      },
      {
        capability: 'JSONL History Browser',
        sdkExposed: !!adapter, // getSessionMessages on SDK facade
        adapterWired: !!adapter, // adapter.getSessionMessages()
        runtimeProof: 'untested',
        userSurface: 'diagnostic', // Only this diagnostic panel
      },
      {
        capability: 'Session Store',
        sdkExposed: true, // sessionStore option in SDK
        adapterWired: true, // buildSdkOptions wires sessionStore
        runtimeProof: 'untested',
        userSurface: 'hidden',
      },
      {
        capability: 'Skills',
        sdkExposed: true, // skills option in SDK
        adapterWired: true, // buildSdkOptions wires skills
        runtimeProof: 'untested',
        userSurface: 'hidden',
      },
      {
        capability: 'Plugins',
        sdkExposed: true, // plugins option in SDK
        adapterWired: true, // buildSdkOptions wires plugins
        runtimeProof: 'untested',
        userSurface: 'hidden',
      },
      {
        capability: 'Agents (Subagents)',
        sdkExposed: !!adapter, // listSubagents, getSubagentMessages
        adapterWired: !!adapter, // adapter methods exist
        runtimeProof: 'untested',
        userSurface: 'diagnostic', // Not in CLAUDE_CODE_PHASE1_CAPABILITIES
      },
      {
        capability: 'Agent Definitions',
        sdkExposed: true, // SDK options accept agent and agents
        adapterWired: true, // buildSdkOptions wires runtime-only agent definitions
        runtimeProof: 'untested',
        userSurface: 'hidden', // No stable authoring UI
      },
      {
        capability: 'Structured Output',
        sdkExposed: true, // outputFormat option in SDK
        adapterWired: true, // buildSdkOptions wires outputFormat
        runtimeProof: 'untested',
        userSurface: 'diagnostic', // backend_event chunks dropped in OpenCodianView
      },
      {
        capability: 'Subagent Transcript / Progress',
        sdkExposed: true, // forwardSubagentText + agentProgressSummaries options
        adapterWired: true, // buildSdkOptions wires both
        runtimeProof: 'untested',
        userSurface: 'settings', // SDK Foundations toggles exist
      },
      {
        capability: 'Include Hook Events',
        sdkExposed: true, // includeHookEvents option
        adapterWired: true, // buildSdkOptions wires it
        runtimeProof: 'untested',
        userSurface: 'settings', // SDK Foundations toggle exists
      },
      {
        capability: 'Import Session to Store',
        sdkExposed: !!adapter, // importSessionToStore on SDK facade
        adapterWired: !!adapter, // adapter.importSessionToStore()
        runtimeProof: 'untested',
        userSurface: 'hidden',
      },
      {
        capability: 'Fork Session',
        sdkExposed: !!adapter, // forkSession on SDK facade
        adapterWired: !!adapter, // adapter.forkSession()
        runtimeProof: 'untested',
        userSurface: 'hidden',
      },
    ];
  }

  // =======================================================================
  // JSONL History Browser (read-only)
  // =======================================================================

  private renderHistoryBrowser(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: t('settings.capabilityLab.history.title') });
    containerEl.createEl('p', {
      cls: 'opencodian-capability-lab-description',
      text: t('settings.capabilityLab.history.description'),
    });

    const adapter = getClaudeCodeAdapter(this.plugin);
    if (!adapter) {
      containerEl.createEl('p', {
        cls: 'opencodian-capability-lab-unavailable',
        text: 'Claude Code adapter not available. Enable the Claude Code backend first.',
      });
      return;
    }

    // Session selector
    const controlsEl = containerEl.createDiv({ cls: 'opencodian-capability-lab-controls' });
    const sessionSelect = controlsEl.createEl('select', {
      cls: 'opencodian-capability-lab-select',
      attr: { 'data-diagnostic': 'true' },
    });
    sessionSelect.createEl('option', { text: '— Select a session —', value: '' });

    const refreshBtn = controlsEl.createEl('button', {
      text: 'Refresh Sessions',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });

    const outputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });

    // Load sessions
    const loadSessions = async (): Promise<void> => {
      try {
        sessionSelect.innerHTML = '';
        sessionSelect.createEl('option', { text: '— Select a session —', value: '' });
        const sessions = await adapter.listSessions();
        for (const session of sessions) {
          const opt = sessionSelect.createEl('option', {
            value: session.sessionId,
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
          });
          opt.title = `Session: ${session.sessionId}\nSummary: ${session.summary}\nModified: ${new Date(session.lastModified).toISOString()}`;
        }
        outputEl.empty();
        outputEl.createEl('p', { text: `Loaded ${sessions.length} sessions.` });
      } catch (err) {
        outputEl.empty();
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `Error loading sessions: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    refreshBtn.addEventListener('click', () => { void loadSessions(); });

    // Load messages on selection
    sessionSelect.addEventListener('change', () => {
      const sessionId = sessionSelect.value;
      if (!sessionId) {
        outputEl.empty();
        return;
      }
      void this.loadSessionMessages(adapter, sessionId, outputEl);
    });

    // Auto-load on first render
    void loadSessions();
  }

  private async loadSessionMessages(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Loading messages…' });

    try {
      const messages = await adapter.getSessionMessages(sessionId, {
        limit: 50,
        includeSystemMessages: false,
      });

      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Session ${sessionId.slice(0, 12)}… — ${messages.length} messages (max 50)`,
      });

      if (messages.length === 0) {
        outputEl.createEl('p', { text: 'No messages found.' });
        return;
      }

      outputEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: truncate(formatJsonPreview(messages), 8000),
      });

      // Update matrix runtime proof
      this.updateRuntimeProof('JSONL History Browser', 'pass', outputEl);
    } catch (err) {
      outputEl.empty();
      const msg = err instanceof Error ? err.message : String(err);
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Error: ${msg}`,
      });
      this.updateRuntimeProof('JSONL History Browser', 'fail', outputEl);
    }
  }

  // =======================================================================
  // Subagent Browser (read-only)
  // =======================================================================

  private renderSubagentBrowser(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: t('settings.capabilityLab.subagents.title') });
    containerEl.createEl('p', {
      cls: 'opencodian-capability-lab-description',
      text: t('settings.capabilityLab.subagents.description'),
    });

    const adapter = getClaudeCodeAdapter(this.plugin);
    if (!adapter) {
      containerEl.createEl('p', {
        cls: 'opencodian-capability-lab-unavailable',
        text: 'Claude Code adapter not available.',
      });
      return;
    }

    const controlsEl = containerEl.createDiv({ cls: 'opencodian-capability-lab-controls' });

    const sessionSelect = controlsEl.createEl('select', {
      cls: 'opencodian-capability-lab-select',
      attr: { 'data-diagnostic': 'true' },
    });
    sessionSelect.createEl('option', { text: '— Select a session —', value: '' });

    const refreshBtn = controlsEl.createEl('button', {
      text: 'Refresh Sessions',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });

    const outputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });

    // Subagent list
    const subagentListEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-subagent-list',
      attr: { 'data-diagnostic': 'true' },
    });

    const subagentOutputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });

    const loadSessions = async (): Promise<void> => {
      try {
        sessionSelect.innerHTML = '';
        sessionSelect.createEl('option', { text: '— Select a session —', value: '' });
        const sessions = await adapter.listSessions();
        for (const session of sessions) {
          sessionSelect.createEl('option', {
            value: session.sessionId,
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
          });
        }
        subagentListEl.empty();
        subagentOutputEl.empty();
        outputEl.empty();
        outputEl.createEl('p', { text: `Loaded ${sessions.length} sessions.` });
      } catch (err) {
        outputEl.empty();
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    refreshBtn.addEventListener('click', () => { void loadSessions(); });

    // Load subagents on session selection
    sessionSelect.addEventListener('change', () => {
      const sessionId = sessionSelect.value;
      if (!sessionId) {
        subagentListEl.empty();
        subagentOutputEl.empty();
        return;
      }
      void this.loadSubagents(adapter, sessionId, subagentListEl, subagentOutputEl);
    });

    void loadSessions();
  }

  private async loadSubagents(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    listEl: HTMLElement,
    outputEl: HTMLElement,
  ): Promise<void> {
    listEl.empty();
    outputEl.empty();
    listEl.createEl('p', { text: 'Listing subagents…' });

    try {
      const agentIds = await adapter.listSubagents(sessionId);
      listEl.empty();

      if (agentIds.length === 0) {
        listEl.createEl('p', { text: 'No subagents found for this session.' });
        this.updateRuntimeProof('Agents (Subagents)', 'pass', listEl);
        return;
      }

      listEl.createEl('h5', { text: `${agentIds.length} subagent(s):` });

      for (const agentId of agentIds) {
        const btn = listEl.createEl('button', {
          text: `Agent: ${truncate(agentId, 40)}`,
          cls: 'opencodian-capability-lab-button opencodian-capability-lab-subagent-btn',
          attr: { 'data-diagnostic': 'true', 'data-agent-id': agentId },
        });
        btn.addEventListener('click', () => {
          void this.loadSubagentMessages(adapter, sessionId, agentId, outputEl);
        });
      }

      this.updateRuntimeProof('Agents (Subagents)', 'pass', listEl);
    } catch (err) {
      listEl.empty();
      listEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Agents (Subagents)', 'fail', listEl);
    }
  }

  private async loadSubagentMessages(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    agentId: string,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: `Loading messages for subagent ${truncate(agentId, 20)}…` });

    try {
      const messages = await adapter.getSubagentMessages(sessionId, agentId, { limit: 50 });
      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Subagent ${truncate(agentId, 20)} — ${messages.length} messages (max 50)`,
      });

      if (messages.length === 0) {
        outputEl.createEl('p', { text: 'No messages found.' });
        return;
      }

      outputEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: truncate(formatJsonPreview(messages), 8000),
      });
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // =======================================================================
  // Rewind Dry-Run Preview (no actual restore)
  // =======================================================================

  private renderRewindDryRun(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: t('settings.capabilityLab.rewind.title') });
    containerEl.createEl('p', {
      cls: 'opencodian-capability-lab-description',
      text: t('settings.capabilityLab.rewind.description'),
    });

    const adapter = getClaudeCodeAdapter(this.plugin);
    if (!adapter) {
      containerEl.createEl('p', {
        cls: 'opencodian-capability-lab-unavailable',
        text: 'Claude Code adapter not available.',
      });
      return;
    }

    const controlsEl = containerEl.createDiv({ cls: 'opencodian-capability-lab-controls' });

    const sessionSelect = controlsEl.createEl('select', {
      cls: 'opencodian-capability-lab-select',
      attr: { 'data-diagnostic': 'true' },
    });
    sessionSelect.createEl('option', { text: '— Select a session —', value: '' });

    const msgInput = controlsEl.createEl('input', {
      cls: 'opencodian-capability-lab-input',
      attr: {
        type: 'text',
        placeholder: 'User message ID for rewind point',
        'data-diagnostic': 'true',
      },
    });

    const dryRunBtn = controlsEl.createEl('button', {
      text: '🔍 Dry-Run Preview Only',
      cls: 'opencodian-capability-lab-button opencodian-capability-lab-button-warning',
      attr: { 'data-diagnostic': 'true' },
    });

    const outputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });

    // No actual restore button — this is intentionally omitted.

    const loadSessions = async (): Promise<void> => {
      try {
        sessionSelect.innerHTML = '';
        sessionSelect.createEl('option', { text: '— Select a session —', value: '' });
        const sessions = await adapter.listSessions();
        for (const session of sessions) {
          sessionSelect.createEl('option', {
            value: session.sessionId,
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
          });
        }
      } catch (err) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    dryRunBtn.addEventListener('click', () => {
      const sessionId = sessionSelect.value;
      const userMessageId = msgInput.value.trim();
      if (!sessionId || !userMessageId) {
        new Notice('Select a session and enter a message ID first.');
        return;
      }
      void this.runRewindDryRun(adapter, sessionId, userMessageId, outputEl);
    });

    void loadSessions();
  }

  private async runRewindDryRun(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    userMessageId: string,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running dry-run rewind preview…' });

    try {
      const result = await adapter.rewindFiles(sessionId, userMessageId, { dryRun: true });
      outputEl.empty();
      outputEl.createEl('h5', { text: 'Dry-Run Rewind Preview (no files were changed)' });
      outputEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: formatJsonPreview(result),
      });
      this.updateRuntimeProof('File Checkpoint / Rewind', 'pass', outputEl);
    } catch (err) {
      outputEl.empty();
      const msg = err instanceof Error ? err.message : String(err);
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Error: ${msg}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Hint: rewindFiles requires an active runtime with checkpointing enabled.',
      });
      this.updateRuntimeProof('File Checkpoint / Rewind', 'fail', outputEl);
    }
  }

  // =======================================================================
  // Structured Output Playground (diagnostic only)
  // =======================================================================

  private renderStructuredOutputPlayground(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: t('settings.capabilityLab.structured.title') });
    containerEl.createEl('p', {
      cls: 'opencodian-capability-lab-description',
      text: t('settings.capabilityLab.structured.description'),
    });

    const adapter = getClaudeCodeAdapter(this.plugin);
    if (!adapter) {
      containerEl.createEl('p', {
        cls: 'opencodian-capability-lab-unavailable',
        text: 'Claude Code adapter not available.',
      });
      return;
    }

    // Status display
    const statusEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-status',
      attr: { 'data-diagnostic': 'true' },
    });

    statusEl.createEl('p', {
      text: 'Structured output is wired through outputFormat in buildSdkOptions, ' +
        'but backend_event chunks (which carry structured_output data) are ' +
        'currently dropped in OpenCodianView\'s chunk conversion pipeline.',
    });

    statusEl.createEl('p', {
      cls: 'opencodian-capability-lab-hint',
      text: '⚠️ This is a diagnostic surface. Structured output is NOT integrated ' +
        'into the normal chat UI. The outputFormat option can only be set at ' +
        'runtime via adapter options, not through user-facing settings.',
    });

    // Attempt to probe structured output from recent messages
    const probeBtn = containerEl.createEl('button', {
      text: '🔍 Probe Recent Session for Structured Data',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });

    const outputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });

    probeBtn.addEventListener('click', () => {
      void this.probeStructuredOutput(adapter, outputEl);
    });
  }

  private async probeStructuredOutput(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Probing recent sessions for structured output data…' });

    try {
      const sessions = await adapter.listSessions();
      if (sessions.length === 0) {
        outputEl.createEl('p', { text: 'No sessions found.' });
        return;
      }

      // Check the most recent session
      const recent = sessions[0];
      const messages = await adapter.getSessionMessages(recent.sessionId, { limit: 20 });

      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Probed ${recent.sessionId.slice(0, 12)}… (${messages.length} messages)`,
      });

      // Look for any structured content in messages
      const structuredCount = messages.filter((msg: unknown) => {
        const m = msg as Record<string, unknown>;
        return m.structured_output !== undefined || m.structuredOutput !== undefined;
      }).length;

      if (structuredCount > 0) {
        outputEl.createEl('p', {
          text: `Found ${structuredCount} message(s) with structured output data.`,
        });
      } else {
        outputEl.createEl('p', {
          text: 'No structured output data found in recent messages. ' +
            'This may indicate structured output was not requested, ' +
            'or that structured output data is carried in backend_event chunks ' +
            'which are not persisted in the JSONL history.',
        });
      }

      this.updateRuntimeProof('Structured Output', structuredCount > 0 ? 'pass' : 'untested', outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // =======================================================================
  // Discovery / Status (hooks, plugins, skills, agents)
  // =======================================================================

  private renderDiscoveryStatus(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: t('settings.capabilityLab.discovery.title') });
    containerEl.createEl('p', {
      cls: 'opencodian-capability-lab-description',
      text: t('settings.capabilityLab.discovery.description'),
    });

    const adapter = getClaudeCodeAdapter(this.plugin);
    const caps = adapter?.capabilities;

    const table = containerEl.createEl('table', {
      cls: 'opencodian-capability-lab-discovery',
    });
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'Feature' });
    headerRow.createEl('th', { text: 'Status' });
    headerRow.createEl('th', { text: 'Notes' });

    const tbody = table.createEl('tbody');

    // Hooks
    this.addDiscoveryRow(tbody, 'Hooks', false, 'No authoring UI. buildSdkOptions wires hooks from adapter options.');
    // Plugins
    this.addDiscoveryRow(tbody, 'Plugins', false, 'No authoring UI. buildSdkOptions wires plugins from adapter options.');
    // Skills
    this.addDiscoveryRow(tbody, 'Skills', false, 'No authoring UI. buildSdkOptions wires skills (string[]|\'all\') from adapter options.');
    // Agent definitions
    this.addDiscoveryRow(tbody, 'Agent Definitions', false, 'No authoring UI. buildSdkOptions wires runtime-only agent/agents options.');
    // Agents / Subagents
    this.addDiscoveryRow(
      tbody,
      'Subagents',
      !!caps && hasCapability(caps, 'subagents'),
      'Capability not in CLAUDE_CODE_PHASE1_CAPABILITIES. Adapter methods exist but UI gating prevents display.',
    );
    // Session Store
    this.addDiscoveryRow(tbody, 'Session Store', false, 'No UI. Wired as runtime-only option.');
    // Import/Delete/Restore
    this.addDiscoveryRow(tbody, 'Import/Delete/Restore', false, 'Adapter methods exist but no UI. Deliberately not exposed in this lab (read-only focus).');

    // Show adapter declared capabilities
    if (caps) {
      containerEl.createEl('h5', { text: 'Declared Backend Capabilities:' });
      const capList = containerEl.createEl('div', {
        cls: 'opencodian-capability-lab-cap-list',
      });
      const allCaps = Array.from(caps);
      for (const cap of allCaps) {
        capList.createSpan({
          cls: 'opencodian-capability-lab-chip opencodian-capability-lab-chip-active',
          text: cap,
        });
      }
      if (allCaps.length === 0) {
        capList.createEl('p', { text: 'No capabilities declared.' });
      }
    }
  }

  private addDiscoveryRow(
    tbody: HTMLTableSectionElement,
    feature: string,
    hasStableUI: boolean,
    notes: string,
  ): void {
    const tr = tbody.createEl('tr');
    tr.createEl('td', { text: feature });
    const statusCell = tr.createEl('td');
    statusCell.createSpan({
      cls: `opencodian-capability-lab-chip${hasStableUI ? ' opencodian-capability-lab-chip-active' : ''}`,
      text: hasStableUI ? 'Exposed' : 'Discovery Only',
    });
    tr.createEl('td', { text: notes });
  }

  // =======================================================================
  // Runtime Proof Update (in-page notification)
  // =======================================================================

  private updateRuntimeProof(
    _capability: string,
    _status: 'pass' | 'fail' | 'untested',
    outputEl: HTMLElement,
  ): void {
    // Lightweight inline marker — does not persist across tab switches.
    // The matrix rows are static; this provides feedback in the browser area.
    labLogger.debug('runtime proof update', { capability: _capability, status: _status });

    const marker = outputEl.createDiv({
      cls: `opencodian-capability-lab-proof-marker opencodian-capability-lab-proof-${_status}`,
      attr: { 'data-diagnostic': 'true' },
    });
    const label = _status === 'pass' ? '✓ Runtime verified'
      : _status === 'fail' ? '✗ Runtime failed'
      : '? Not tested';
    marker.createSpan({ text: label });
  }
}
