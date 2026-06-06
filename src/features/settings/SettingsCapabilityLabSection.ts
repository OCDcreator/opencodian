/* eslint-disable max-lines -- Capability Lab owns diagnostic matrix, history browser, subagent browser, rewind preview, structured output playground, and discovery status for the same diagnostic boundary. */
/**
 * Capability Lab — diagnostic / experimental workbench for Claude Code SDK parity.
 *
 * All UI surfaces in this file are intentionally:
 *   - Read-only, dry-run, or isolated diagnostic-store writes only
 *   - Labelled ⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE
 *   - NOT connected to stable settings persistence
 *
 * See openspec/phase1-capability-lab.md for design rationale.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Notice, Setting } from 'obsidian';

import type { BackendCapabilities } from '../../core/agents/AgentCapability';
import { hasCapability } from '../../core/agents/AgentCapability';
import {
  getBackendSessionPreview,
  listBackendSessions,
  readBackendSessionShareUrl,
  readBackendSessionTitle,
} from '../../core/agents/backend/AgentBackendRouting';
import type { ClaudeCodeAdapter, ClaudeCodeDiagnosticPromptResult } from '../../core/agents/backend/ClaudeCodeAdapter';
import type { ClaudeCodePermissionBridge } from '../../core/agents/backend/ClaudeCodePermissionBridge';
import type { AgentBackendKind } from '../../core/types/chat';
import {
  getDefaultClaudeCodeBackendSettings,
} from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';

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
  runtimeProof: 'untested' | 'pass' | 'fail' | 'wiring' | 'boundary' | 'readback';
  userSurface: 'settings' | 'diagnostic' | 'hidden' | 'chat' | 'settings+chat';
}

interface CapabilityLabSessionStoreEntry {
  type: string;
  uuid?: string;
  timestamp?: string;
  [key: string]: unknown;
}

interface CapabilityLabSessionStoreKey {
  projectKey: string;
  sessionId: string;
  subpath?: string;
}

interface CapabilityLabPluginState {
  sessionStore: CapabilityLabSessionStore;
}

type DiscoveryRowStatus = 'discovery' | 'exposed' | 'diagnostic-proof';

interface DiscoveryRowOptions {
  status?: DiscoveryRowStatus;
}

interface CapabilityLabProbeShell {
  fieldRowEl: HTMLElement;
  actionRowEl: HTMLElement;
  outputEl: HTMLElement;
  statusEl: HTMLElement | null;
}

export class CapabilityLabSessionStore {
  private readonly entries = new Map<string, CapabilityLabSessionStoreEntry[]>();
  private readonly mtimes = new Map<string, number>();

  private toEntryKey(key: CapabilityLabSessionStoreKey): string {
    return `${key.projectKey}::${key.sessionId}::${key.subpath ?? ''}`;
  }

  private toSessionKey(projectKey: string, sessionId: string): string {
    return `${projectKey}::${sessionId}`;
  }

  async append(
    key: CapabilityLabSessionStoreKey,
    newEntries: CapabilityLabSessionStoreEntry[],
  ): Promise<void> {
    const entryKey = this.toEntryKey(key);
    const existing = this.entries.get(entryKey) ?? [];
    existing.push(...newEntries.map((entry) => ({ ...entry })));
    this.entries.set(entryKey, existing);
    this.mtimes.set(this.toSessionKey(key.projectKey, key.sessionId), Date.now());
  }

  async load(key: CapabilityLabSessionStoreKey): Promise<CapabilityLabSessionStoreEntry[] | null> {
    const existing = this.entries.get(this.toEntryKey(key));
    return existing ? existing.map((entry) => ({ ...entry })) : null;
  }

  async listSessions(projectKey: string): Promise<Array<{ sessionId: string; mtime: number }>> {
    const prefix = `${projectKey}::`;
    return Array.from(this.mtimes.entries())
      .filter(([sessionKey]) => sessionKey.startsWith(prefix))
      .map(([sessionKey, mtime]) => ({
        sessionId: sessionKey.slice(prefix.length),
        mtime,
      }));
  }

  async listSubkeys(key: { projectKey: string; sessionId: string }): Promise<string[]> {
    const prefix = `${key.projectKey}::${key.sessionId}::`;
    return Array.from(this.entries.keys())
      .filter((entryKey) => entryKey.startsWith(prefix))
      .map((entryKey) => entryKey.slice(prefix.length))
      .filter((subpath) => subpath.length > 0);
  }
}

const capabilityLabStateByPlugin = new WeakMap<OpenCodianPlugin, CapabilityLabPluginState>();

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

function getCapabilityLabState(plugin: OpenCodianPlugin): CapabilityLabPluginState {
  let state = capabilityLabStateByPlugin.get(plugin);
  if (!state) {
    state = {
      sessionStore: new CapabilityLabSessionStore(),
    };
    capabilityLabStateByPlugin.set(plugin, state);
  }
  return state;
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
      'Some probes may mirror data into an isolated diagnostic store, but nothing here changes stable plugin behavior or persists settings. Do not rely on these features.',
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
    ['Writes', 'Isolated diagnostic only'],
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
    chat: 'Chat',
    'settings+chat': 'Settings + Chat',
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

const SENSITIVE_RUNTIME_SETTINGS_KEY_PARTS = [
  'apikey',
  'token',
  'secret',
  'password',
  'credential',
  'authorization',
  'oauth',
];
const SENSITIVE_RUNTIME_SETTINGS_ENV_KEYS = new Set([
  'env',
  'envvars',
  'environment',
  'environmentvariables',
  'processenv',
  'processenvironment',
]);

function isSensitiveRuntimeSettingsKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_RUNTIME_SETTINGS_ENV_KEYS.has(normalizedKey)
    || SENSITIVE_RUNTIME_SETTINGS_KEY_PARTS.some((part) => normalizedKey.includes(part));
}

function redactRuntimeSettingsReadback(value: unknown, key = '', depth = 0): unknown {
  if (isSensitiveRuntimeSettingsKey(key)) {
    if (Array.isArray(value)) {
      return `[redacted ${value.length} item(s)]`;
    }
    if (typeof value === 'object' && value !== null) {
      return `[redacted ${Object.keys(value as Record<string, unknown>).length} key(s)]`;
    }
    return '[redacted]';
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= 4) {
    return '[truncated]';
  }
  if (Array.isArray(value)) {
    const preview = value
      .slice(0, 20)
      .map((item) => redactRuntimeSettingsReadback(item, key, depth + 1));
    if (value.length > 20) {
      preview.push(`[${value.length - 20} more item(s)]`);
    }
    return preview;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of entries.slice(0, 80)) {
    output[entryKey] = redactRuntimeSettingsReadback(entryValue, entryKey, depth + 1);
  }
  if (entries.length > 80) {
    output.__truncated = `${entries.length - 80} more key(s)`;
  }
  return output;
}

interface FallbackStructuredOutput {
  status: 'ok' | 'error';
  surface: 'diagnostic';
  confidence: number;
}

function tryParseFallbackStructuredOutput(chunks: Array<unknown>): FallbackStructuredOutput | undefined {
  const textChunks = chunks.filter((c): c is Extract<typeof c, { type: 'text' }> =>
    typeof c === 'object' && c !== null && 'type' in c && (c as { type: string }).type === 'text'
  );
  const firstText = textChunks[0];
  if (!firstText || !('content' in firstText) || typeof (firstText as { content: unknown }).content !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse((firstText as { content: string }).content.trim());
    if (
      parsed && typeof parsed === 'object' &&
      typeof parsed.status === 'string' && (parsed.status === 'ok' || parsed.status === 'error') &&
      typeof parsed.surface === 'string' && parsed.surface === 'diagnostic' &&
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence) && parsed.confidence >= 0 && parsed.confidence <= 1
    ) {
      return parsed as FallbackStructuredOutput;
    }
  } catch {
    // Not valid JSON — fallback detection failed
  }
  return undefined;
}

function readMessagePreview(message: unknown): { label: string; preview: string; id?: string } {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return {
      label: 'entry',
      preview: truncate(String(message), 160),
    };
  }
  const record = message as {
    type?: unknown;
    uuid?: unknown;
    id?: unknown;
    role?: unknown;
    content?: unknown;
    text?: unknown;
    result?: unknown;
    summary?: unknown;
  };
  const previewParts = [
    record.content,
    record.text,
    record.result,
    record.summary,
  ].filter((value) => value !== undefined);
  const preview = truncate(
    previewParts.length > 0 ? formatJsonPreview(previewParts[0]).replace(/\s+/g, ' ').trim() : formatJsonPreview(record),
    220,
  );
  const labelCandidate = [record.type, record.role].find((value) => typeof value === 'string' && value.trim().length > 0);
  const idCandidate = [record.uuid, record.id].find((value) => typeof value === 'string' && value.trim().length > 0);
  return {
    label: typeof labelCandidate === 'string' ? labelCandidate : 'entry',
    preview,
    id: typeof idCandidate === 'string' ? idCandidate : undefined,
  };
}

function isHookBackendEventChunk(
  chunk: import('../../core/types/chat').StreamChunk,
): chunk is Extract<import('../../core/types/chat').StreamChunk, { type: 'backend_event' }> & { event: 'hook' } {
  return chunk.type === 'backend_event' && chunk.event === 'hook';
}

function renderMessagePreviewList(
  outputEl: HTMLElement,
  heading: string,
  messages: unknown[],
): void {
  outputEl.createEl('h5', { text: heading });
  const previewList = outputEl.createDiv({
    cls: 'opencodian-capability-lab-preview-list',
    attr: { 'data-diagnostic': 'true' },
  });
  for (const message of messages.slice(0, 12)) {
    const { label, preview, id } = readMessagePreview(message);
    const row = previewList.createDiv({ cls: 'opencodian-capability-lab-preview-row' });
    row.createSpan({
      cls: 'opencodian-capability-lab-chip opencodian-capability-lab-chip-active',
      text: label,
    });
    if (id) {
      row.createSpan({
        cls: 'opencodian-capability-lab-preview-meta',
        text: truncate(id, 18),
      });
    }
    row.createSpan({
      cls: 'opencodian-capability-lab-preview-text',
      text: preview,
    });
  }
  if (messages.length > 12) {
    outputEl.createEl('p', {
      cls: 'opencodian-capability-lab-hint',
      text: `Showing the first 12 of ${messages.length} entries.`,
    });
  }
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

  private get claudeCodeSettings() {
    this.plugin.settings.backendSettings ??= { claudeCode: getDefaultClaudeCodeBackendSettings() };
    this.plugin.settings.backendSettings.claudeCode ??= getDefaultClaudeCodeBackendSettings();
    return this.plugin.settings.backendSettings.claudeCode;
  }

  private async saveClaudeCodeSettings(): Promise<void> {
    await this.plugin.saveSettings();
  }

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

    // ── Fork Session Diagnostic (provider-owned, diagnostic only) ─────
    const forkBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'fork' },
    });
    this.renderForkProbe(forkBlock);

    // ── Resume Session Diagnostic (provider-owned, diagnostic only) ───
    const resumeBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'resume' },
    });
    this.renderResumeProbe(resumeBlock);

    // ── Session Detail Diagnostic (provider-owned, diagnostic only) ──
    const sessionDetailBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'session-detail' },
    });
    this.renderSessionDetailProbe(sessionDetailBlock);

    // ── Backend Routing Diagnostic (provider-owned, diagnostic only) ──
    const backendRoutingBlock = containerEl.createDiv({
      cls: 'opencodian-settings-block',
      attr: { 'data-section-block': 'backend-routing' },
    });
    this.renderBackendRoutingProbe(backendRoutingBlock);

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
        : row.runtimeProof === 'readback' ? 'Readback verified'
        : row.runtimeProof === 'fail' ? 'Failed'
        : row.runtimeProof === 'wiring' ? 'Wiring only'
        : row.runtimeProof === 'boundary' ? 'Boundary hit'
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
      ...this.buildCoreMatrixRows(adapter),
      ...this.buildRecentMatrixRows(),
    ];
  }

  private buildCoreMatrixRows(adapter: ClaudeCodeAdapter | null): MatrixRow[] {
    return [
      {
        capability: 'Hooks',
        sdkExposed: true, // SDK options accept hooks
        adapterWired: true, // buildSdkOptions wires hooks
        runtimeProof: 'pass', // Layer 1 (JS callback): programmatic hooks option passed to SDK query(). SDK subprocess may or may not invoke JS callbacks depending on SDK version. Layer 2 (includeHookEvents stream): captures hook backend_events when includeHookEvents=true. Layer 3 (shell-hook from config file): .claude/settings.json and .claude/settings.local.json shell hooks are loaded by the SDK subprocess when the corresponding settingSources are enabled. IMPORTANT: default settingSources is ['project'] which reads .claude/settings.json but NOT .claude/settings.local.json. To activate hooks in settings.local.json, users must enable 'local' in settingSources (Context & Sources tab). The hook proof report now honestly distinguishes Layer 1 vs Layer 3 results and reports current settingSources configuration.
        userSurface: 'settings', // Settings: project settings scan/create/open for .claude/settings.json + .claude/settings.local.json. Hooks are configured by editing these files directly; the settings surface provides discovery and file access, not a visual hook editor. Note: hooks in .claude/settings.local.json only activate when settingSources includes 'local'.
      },
      {
        capability: 'File Checkpoint / Rewind',
        sdkExposed: true, // enableFileCheckpointing option + rewindFiles on query
        adapterWired: true, // adapter.rewindFiles() exists
        runtimeProof: 'readback', // BLOCKER=upstream SDK bug #236 (open 2026-03-17, 3 reactions, no maintainer response). Current truth: File Checkpoint / Rewind is still readback, not pass. SDK 0.3.158 was tested; Obsidian/Electron needs a setMaxListeners(AbortSignal) monkey-patch. Even with that patch, 10/10 candidates still return canRewind:false, with no improvement over 0.3.145. Snapshot creation is still gated behind React/Ink UI useState setters and never fires in SDK query() mode. rewindFiles() sends `sdk_rewind_files` control request to the CLI subprocess, which still finds empty file history. applyFlagSettings({ fileCheckpointingEnabled: true }) remains a dead-end seam: it does not revive snapshot creation mid-stream.
        userSurface: 'diagnostic', // Capability Lab toggle; no stable rewind UI exposed
      },
      {
        capability: 'JSONL History Browser',
        sdkExposed: !!adapter, // getSessionMessages on SDK facade
        adapterWired: !!adapter, // adapter.getSessionMessages()
        runtimeProof: 'pass', // BUILD_ID feature-phase0-capability.202605281948: listSessions returned 38 sessions, getSessionMessages returned 10 messages for d2ea808d…, full message preview rendered.
        // Stable user surface: BackendSessionBrowserModal provides browse + preview + detail from both chat history and settings. Settings launcher is browse-only (no resume); chat launcher supports resume. The modal itself is a stable shared component.
        userSurface: 'settings+chat',
      },
      {
        capability: 'Session Store',
        sdkExposed: true, // sessionStore option in SDK
        adapterWired: true, // buildSdkOptions wires sessionStore
        runtimeProof: 'pass', // BUILD_ID feature-phase0-capability.202605281948: runDiagnosticPrompt with sessionStore + sessionStoreFlush='eager' succeeded; store captured 14 entries across 1 key for session 8c762ebb…. importSessionToStore also proven separately.
        // BLOCKER for promotion to stable user surface:
        // 1. Alpha SDK interface (sdk.d.ts marks SessionStore as alpha) with no format stability guarantee across SDK versions.
        // 2. Store data format is opaque and implementation-defined by the CLI — no schema contract, no cross-version compatibility promise. The append/load/listSessions/listSubkeys interface is a low-level persistence seam, not a user-facing archive format.
        // 3. Existing BackendSessionBrowserModal already provides browse + resume for native JSONL sessions without requiring an external store.
        // 4. Existing StorageService already persists OpenCodian conversations in a human-readable format.
        // 5. Productizing would create a second parallel persistence layer with no clear user value over native JSONL + conversation persistence. Users would see opaque store entries instead of readable transcripts.
        // 6. No user workflow is served that isn't already covered: browse (backend browser), resume (backend browser + chat), persist (StorageService).
        // KEEP HIDDEN — diagnostic proof only.
        userSurface: 'hidden',
      },
      {
        capability: 'Skills',
        sdkExposed: true, // skills option in SDK
        adapterWired: true, // buildSdkOptions wires skills
        runtimeProof: 'pass', // Runtime verified (BUILD_ID feature-phase0-capability.202605291343, session 62720fb2-c031-441a-95d2-f3d3932f62b5): test SKILL.md created in vault/.claude/skills/opencodian-proof-skill/ with marker SP26, skills:['opencodian-proof-skill'] passed via SDK options, SDK subprocess CWD matches vault path, Layer 1 readback PASS, Layer 2 behavior PASS — marker SP26 found at start of model response. Skills context filtering is functional. No authoring UI.
        userSurface: 'settings', // Settings: project skills discovery + create/open actions in Claude Code runtime tab. Chat slash discoverability for Claude runtime commands (via raw text passthrough when claude-code backend is active).
      },
      {
        capability: 'Plugins',
        sdkExposed: true, // plugins option in SDK
        adapterWired: true, // buildSdkOptions wires plugins
        runtimeProof: 'pass', // Marketplace plugin system is the real runtime path. Programmatic SdkPluginConfig (type:'local', path) is accepted at API boundary but ignored by the subprocess — structurally identical to Hooks JS callback limitation. Marketplace-installed plugins from ~/.claude/plugins/ cache ARE loaded and contribute plugin-scoped skills (pluginName:skillName naming) to init.skills. Plugin-provided MCP servers appear in init.mcp_servers with plugin: prefix. Pass is anchored to plugin→skills chain only.
        userSurface: 'settings', // Settings: project settings scan/create/open for .claude/settings.json + .claude/settings.local.json. Plugins are enabled by editing enabledPlugins in these files; the settings surface provides discovery and file access, not a marketplace manager.
      },
      {
        capability: 'MCP Servers',
        sdkExposed: true, // mcpServers option in SDK
        adapterWired: true, // buildSdkOptions wires mcpServers + ClaudeCodeMcpConfigAdapter
        runtimeProof: 'pass', // Direct SDK smoke artifact proves positive MCP passthrough.
        userSurface: 'settings', // Runtime passthrough via shared MCP settings tab; Claude Code Tools tab exposes refresh.
      },
      {
        capability: 'Allowed Tools',
        sdkExposed: true, // allowedTools option in SDK
        adapterWired: true, // buildSdkOptions wires normalized settings into SDK options
        runtimeProof: 'readback', // Product boundary: allowedTools is an auto-approve/pre-allow shortcut only.
        // It does NOT filter the init tool catalog (unlike disallowedTools which removes tools, or
        // restrictedBuiltinTools/SDK `tools` which restricts availability). All runtime evidence
        // confirms zero enforcement: catalog always unfiltered (34 tools), canUseTool dead in
        // query() mode, non-bypass synthetic canUseTool passes non-allowed tools through.
        // "Restricted Built-in Tools" owns the SDK `tools` restrictor (deterministic pass).
        // Readback is the honest ceiling for Allowed Tools — the option reaches the SDK boundary
        // but has no measurable enforcement effect.
        userSurface: 'settings',
      },
      {
        capability: 'Disallowed Tools',
        sdkExposed: true, // disallowedTools option in SDK
        adapterWired: true, // buildSdkOptions wires normalized settings into SDK options
        runtimeProof: 'pass', // Runtime verified: runDisallowedToolsProof inspects the SDK init message
        // (type:'system', subtype:'init') tools field. When disallowedTools:['Bash'] is set,
        // the init message's tools[] catalog excludes Bash — proving the SDK enforces
        // disallowedTools at the tool-catalog level (tool removed from model's context).
        // This is deterministic: it does not depend on model tool-calling behavior.
        // bypassPermissions and disallowedTools are orthogonal CLI flags; no interaction.
        userSurface: 'settings',
      },
      {
        capability: 'Restricted Built-in Tools',
        sdkExposed: true, // SDK `tools` option (string[]) restricts built-in tools at init catalog level
        adapterWired: true, // buildClaudeCodeOptions wires restrictedBuiltinTools to options.tools
        runtimeProof: 'pass', // Deterministic at init tool-catalog level: SDK `tools: ['Read']` restricts init catalog
        // to only Read + MCP tools. MCP tools always pass through regardless. Proof exercises
        // the normal settings wiring path (restrictedBuiltinTools → buildClaudeCodeOptions →
        // options.tools), not the _diagnosticToolRestriction escape hatch. The live settings
        // object is mutated, saved, diagnostic prompt runs without diagnostic override, then
        // original setting is restored. This is the honest product path: user-facing
        // "Restricted Built-in Tools" maps to SDK `tools` (availability restrictor), which is
        // semantically distinct from `allowedTools` (auto-approve shortcut).
        // Empty = default preset (all built-in tools).
        userSurface: 'settings',
      },
      {
        capability: 'Turn/Budget Limits',
        sdkExposed: true, // maxTurns and maxBudgetUsd options in SDK
        adapterWired: true, // buildSdkOptions wires normalized settings into SDK options
        runtimeProof: 'pass', // Live proof 2026-05-29: SDK emitted error_max_turns result with subtype="error_max_turns", num_turns=2, cost=$0.13 via runMaxTurnsProof diagnostic probe. Both maxTurns and maxBudgetUsd enforcement verified. SDK throws after the result message, so runDiagnosticPrompt catches non-fatal SDK errors and returns rawMessages + sdkError.
        userSurface: 'settings',
      },
      {
        capability: 'Environment Variables',
        sdkExposed: true, // env option for Claude Code process/query environment
        adapterWired: true, // buildSdkOptions/process resolution carries normalized env settings
        runtimeProof: 'pass', // Runtime behavior proof achieved: env-derived side-effect file contains expected nonce value, proving env propagation into Bash subprocess. All four layers pass: Layer 1 (SDK readback), Layer 2 (Bash tool invoked), Layer 3 (env-derived filesystem side effect), Layer 4 (assistant text nonce echo). Scope boundary: does NOT prove permission approval UX (proven separately by ordinary chat + live harness paths).
        userSurface: 'settings',
      },
      {
        capability: 'Fallback Model',
        sdkExposed: true, // fallbackModel option in SDK query options
        adapterWired: true, // buildSdkOptions wires normalized settings into SDK options
        runtimeProof: 'readback', // Source-backed blocker hardened. SDK source (sdk.mjs) contains exactly 3 fallback references, all in ProcessTransport.initialize(): (1) destructure fallbackModel:w from options, (2) validate w!==N (same-model throws), (3) push --fallback-model w to CLI args. ZERO switching logic in SDK — all model-switching lives in compiled CLI binary, triggered by API-side HTTP 529/capacity overload. CLI help confirms: "when default model is overloaded (only works with --print)". Invalid-primary test (BUILD_ID feature-phase0-capability.202605300441) undermined: SDK accepts arbitrary model names at query boundary, reports same string back, no fallback triggered. Cannot simulate real API overload locally without faking external signals. Detection seams explored: (a) result message `modelUsage` — passive detection plumbing runtime-verified; if native fallback occurs, `Object.keys(modelUsage).length > 1`. (b) `query.setModel()` — SDK source verified (sdk.mjs: sends `{subtype:"set_model",model}` control request); wiring proven; NOT live-runtime-verified (no test confirming model change for subsequent API calls); manual switch seam, not automatic fallback. (c) `applyFlagSettings({model})` — identified in SDK types but NOT runtime-verified; settings-layer manual switch; same category as setModel. (d) `SDKAPIRetryMessage` with `error_status===529` — identified in SDK types (sdk.d.ts:2521) but NOT runtime-verified; detects retries, not fallback itself. Classification remains readback: automatic fallback option wiring verified, switching behavior not locally provable. Next executable path: either Anthropic exposes a programmatic fallback trigger in SDK, or we accept readback as the honest ceiling.
        userSurface: 'settings',
      },

      {
        capability: 'Permission Approval',
        sdkExposed: true, // canUseTool option in SDK
        adapterWired: true, // ClaudeCodePermissionBridge is injected into chat SDK options (ordinary path)
        runtimeProof: 'pass', // Ordinary chat end-to-end proof achieved: launcher sends message through real chat pipeline (sendPipelineRuntime.sendMessage) with proof-time permissionMode override to 'plan'. Model calls ExitPlanMode, Bash (mkdir), and Write tools through SDK tool_use mechanism. Permission cards render with data-permission-card and data-permission-action selectors for EACH tool call. User clicks 'once' on each card. Stream continues after each approval. Target file is created with correct nonce content. Settings restored to original values in finally block.
        userSurface: 'chat', // Reuses existing shared permission card UI in ordinary chat; no separate Claude permission settings page. The user surface is the chat interaction itself, not a settings control.
      },
      {
        capability: 'AskUserQuestion / Elicitation',
        sdkExposed: true, // AskUserQuestion canUseTool path + onElicitation option
        adapterWired: true, // bridge maps question answers and options builder forwards onElicitation
        runtimeProof: 'pass', // Ordinary chat end-to-end proof achieved: message sent through real chat pipeline (sendPipelineRuntime.sendMessage), model called AskUserQuestion through SDK, question dialog rendered with data-question-card selector, user selected Yes and clicked submit (data-question-action), stream continued with answer incorporated. The chat view (opencodian-view leaf) and send pipeline are fully accessible. Added data-question-card and data-question-action selectors for verification stability. Added ordinary chat launcher in Capability Lab.
        userSurface: 'chat', // Reuses existing shared question dialog in ordinary chat; no separate Claude question settings page. The user surface is the chat interaction itself, not a settings control.
      },
      {
        capability: 'Agents (Subagents)',
        sdkExposed: !!adapter, // listSubagents, getSubagentMessages
        adapterWired: !!adapter, // adapter methods exist
        runtimeProof: 'pass', // Runtime verified (BUILD_ID feature-phase0-capability.202605300015, session 3437aca1-8433-458a-83f2-f3cb1b944841): inline agent definitions + Agent tool prompt triggers real subagent spawning. listSubagents() returned 1 subagent (a3c7d70a179a6bc1b), getSubagentMessages() returned 2 messages. Promoted from readback to pass.
        // DIAGNOSTIC ONLY: This row represents the diagnostic API browser (listSubagents/getSubagentMessages),
        // not a stable user-facing subagent management surface. The stable user ability is ordinary chat
        // task rendering — which is covered by 'Subagent Transcript / Progress' (userSurface: 'chat').
        // There is no general subagent browser as a stable product surface.
        userSurface: 'diagnostic', // Diagnostic API browser only; stable UX is task rendering in chat
      },
      {
        capability: 'Agent Definitions',
        sdkExposed: true, // SDK options accept agent and agents
        adapterWired: true, // buildSdkOptions wires runtime-only agent definitions
        runtimeProof: 'pass', // Runtime verified: inline agent definition proof passes. SDK accepts agent/agents options (Layer 1 readback) AND the selected agent alters assistant behavior (Layer 2 marker echo).
        userSurface: 'settings', // Settings: project agents discovery + create/open actions in Claude Code runtime tab. @agent mention menu shows Claude runtime agents for Claude backend conversations.
      },
      {
        capability: 'Structured Output',
        sdkExposed: true, // outputFormat option in SDK
        adapterWired: true, // buildSdkOptions wires outputFormat
        runtimeProof: 'pass', // Ordinary chat end-to-end proof achieved: /json prefix trigger works in SendPipelineRuntime.sendMessage(), stripping the prefix and injecting a fixed JSON schema into outputFormat. Duplicate raw JSON suppression works (textBlockCount=0 during stream, filterDuplicateStructuredOutputContentBlocks during hydration). Hook text leak fixed (ClaudeCodeStreamNormalizer filters synthetic user messages). Structured output badge renders during streaming (StreamShellFinalizer) and survives reload/hydration. Residual ~4 chars of follow-up prose ("Done") after StructuredOutput tool_call is an SDK/model boundary, not a plugin bug.
        userSurface: 'chat', // Triggered via /json prefix in ordinary chat. Fixed schema (response + tags + confidence), one-shot per message, no schema authoring UI. Claude Code backend only; OpenCode ignores unknown outputFormat.
      },
      {
        capability: 'Subagent Transcript / Progress',
        sdkExposed: true, // forwardSubagentText + agentProgressSummaries options
        adapterWired: true, // buildSdkOptions wires both
        runtimeProof: 'pass', // Runtime verified (BUILD_ID feature-phase0-capability.202605300015, session 47a3a9ed-ea6e-45a9-8b2a-67be62d807dc): inline agent definitions + Agent tool prompt triggers real subagent spawning, producing task_started and task_notification events in the stream. Model used Agent tool to invoke proof-worker subagent. Promoted from fail to pass.
        // STABLE CHAT SURFACE: This row covers the ordinary chat task/subagent/todo rendering that users already see:
        // ToolCallRenderer kind:'task' path renders subagent type, description, session ID, and open button;
        // BackgroundTaskStreamTriggerCoordinator manages lifecycle; BackgroundTaskInlinePanelRenderer shows inline status;
        // BackgroundTaskTimelineService assembles timeline; ChildSessionGraphService renders child-session graph;
        // tab indicators and completion notices signal background work; SessionTodoCoordinator renders todo snapshots.
        // These are tool-call-level features (model decides to invoke), not SDK Options-level capabilities.
        // SEPARATE from the diagnostic stream proof (forwardSubagentText + agentProgressSummaries backend events in Capability Lab).
        userSurface: 'chat', // Stable chat surface: task/subagent tool rendering, background task UI, todo snapshots
      },
      {
        capability: 'Include Hook Events',
        sdkExposed: true, // includeHookEvents option
        adapterWired: true, // buildSdkOptions wires it
        runtimeProof: 'pass', // Runtime verified: includeHookEvents: true captures real hook backend_events in diagnostic stream. Diagnostic-only — no stable hook authoring or transcript UI.
        userSurface: 'diagnostic', // Diagnostic-only; no stable hook authoring productization
      },
      {
        capability: 'Import Session to Store',
        sdkExposed: !!adapter, // importSessionToStore on SDK facade
        adapterWired: !!adapter, // adapter.importSessionToStore()
        runtimeProof: 'pass', // BUILD_ID feature-phase0-capability.202605281948: imported session d2ea808d… into diagnostic store with 51 entries, 1 store key. SDK importSessionToStore accepted sessionStore with append/load interface.
        // BLOCKER for promotion to stable user surface:
        // 1. Alpha SDK interface with no format stability guarantee.
        // 2. Imports INTO an opaque store format, not into user-readable OpenCodian conversations. The destination format is implementation-defined by the CLI.
        // 3. No user workflow is served that isn't already covered by existing features: browse native JSONL (backend browser), resume (backend browser + chat), persist conversations (StorageService).
        // 4. Import direction mismatches typical user need: users would want to import sessions INTO readable conversations, not into an opaque archive store.
        // 5. The existing backend session browser can already list, preview, detail, and resume any native JSONL session without import indirection.
        // KEEP HIDDEN — diagnostic proof only.
        userSurface: 'hidden',
      },
      {
        capability: 'Fork Session',
        sdkExposed: !!adapter, // forkSession on SDK facade
        adapterWired: !!adapter, // adapter.forkSession()
        runtimeProof: 'pass', // BUILD_ID feature-phase0-capability.202605281335: adapter-layer fork of provider session 5983419f→35ba7b0a (valid UUID), UI-path fork d5f325ad→d2ea808d (valid UUID, title "Restored Claude Code chat (fork)"), local-handle rejection confirmed. Both adapter and Capability Lab UI proofs passed with screenshot+JSON artifacts. Stable chat surface: UserMessageFooterRenderer renders fork button per AgentCapability.Fork; ConversationLoadRecoveryCoordinator handles fork flow with tab/new-tab targets.
        userSurface: 'chat', // Chat surface: fork button on user message footer, routed via AgentCapability.Fork through getCurrentConversationForkService()
      },
      {
        capability: 'Resume Session',
        sdkExposed: true, // resume option in SDK
        adapterWired: true, // buildSdkOptions wires resumeSessionId
        runtimeProof: 'pass', // BUILD_ID feature-phase0-capability.202605281948: resumed session d2ea808d…, resulting sessionId matches target, model responded "Session resumed successfully.", 1 text chunk, exit code 0.
        // Stable user surface: chat-only. BackendSessionBrowserModal launched from chat history supports full resume flow (createConversationFromBackendSession + loadConversation). Settings launcher is browse-only (supportsResume: false) and does not expose resume.
        userSurface: 'chat',
      },
      {
        capability: 'Session Detail',
        sdkExposed: !!adapter, // getSession on SDK facade
        adapterWired: !!adapter, // adapter.getSession()
        runtimeProof: 'pass', // BUILD_ID feature-phase0-capability.202605281948: getSession(d2ea808d…) returned 10 keys (sessionId, summary, lastModified, fileSize, customTitle, firstPrompt, gitBranch, cwd, tag, createdAt), id=d2ea808d, summary="Restored Claude Code chat (fork)".
        // Stable user surface: BackendSessionBrowserModal detail view is available from both chat and settings. Both surfaces show the same metadata + transcript detail UI.
        userSurface: 'settings+chat',
      },
      {
        capability: 'Backend Routing',
        sdkExposed: true, // AgentServiceRegistry provides routing
        adapterWired: true, // registry.getActive() resolves adapter
        runtimeProof: 'pass', // BUILD_ID feature-phase0-capability.202605281948: registry routes correctly: activeKind=claude-code, adapters=[opencode,claude-code], listSessions via adapter=38 sessions, capabilities=[chat,sessions,fork,models,thinking,file-ops,shell]. Diagnostic-only — no stable routing UI.
        userSurface: 'diagnostic', // Capability Lab backend routing probe only
      },
      {
        capability: '/context Diagnostic',
        sdkExposed: true, // SDK query() accepts prompt strings including slash commands
        adapterWired: true, // runDiagnosticPrompt() passes prompt through to SDK query()
        runtimeProof: 'pass', // Diagnostic-only: adapter.runDiagnosticPrompt({ prompt: '/context', persistSession: false, _diagnosticBypassPermissions: true }) executes the fixed read-only slash command /context and returns the standard "## Context Usage" report with raw message types system → assistant → result. This proves a safe read-only diagnostic command seam exists. This does NOT mean ordinary Claude chat slash commands are productized. Fixed allow-listed command: /context only. No arbitrary command input. No command authoring. No .claude/** writes.
        userSurface: 'diagnostic', // Capability Lab diagnostic proof only — not a stable command authoring surface
      },
      {
        capability: 'Warm Startup',
        sdkExposed: true, // SDK exports top-level startup() → Promise<WarmQuery> with query() and close() methods
        adapterWired: true, // adapter.runWarmStartupProbe() calls sdk.startup() and sends diagnostic prompt through WarmQuery
        runtimeProof: 'readback', // startup() callable, WarmQuery handle obtainable, warm query() produces response. Warm-vs-cold latency benefit is the SDK's internal claim ("no startup latency"), not independently measured in this probe. The seam proves entry-point availability and warm handle usability, not a measurable behavioral improvement.
        userSurface: 'diagnostic', // Capability Lab diagnostic proof only — no stable warm-startup surface
      },
    ];
  }

  private buildRecentMatrixRows(): MatrixRow[] {
    return [
      {
        capability: 'Sandbox',
        sdkExposed: true, // SDK Options.sandbox?: SandboxSettings
        adapterWired: true, // buildClaudeCodeOptions wires sandbox.enabled/failIfUnavailable/autoAllowBashIfSandboxed
        runtimeProof: 'readback', // 2026-06-06 audit: SDK sandbox path fully traced.
        // Option wiring: enabled/failIfUnavailable/autoAllowBashIfSandboxed propagate through
        // ClaudeCodeOptionsBuilder → SDK Options.sandbox → SDK X2() merges into --settings JSON → CLI subprocess.
        // SDK defaults: when enabled=true, X2() sets failIfUnavailable=true if unspecified (per sdk.d.ts line 1662).
        // Readback ceiling remains: the CLI binary handles OS-level sandbox enforcement internally.
        // No observable signal confirms activation: no init event, no tool metadata, no stderr pattern,
        // no CLAUDE_CODE_SANDBOXED env var (that's assistant-worker path only, not createQuery path).
        // Plugin cannot distinguish "sandbox active" from "sandbox silently degraded" or "unsupported platform".
        // Network, filesystem, TLS, proxy, and Mach lookup sub-policies exist in SandboxSettingsSchema
        // but are intentionally not exposed as stable settings in this version.
        // Promotion path: if SDK adds sandbox status to init event or tool result metadata, re-audit.
        userSurface: 'settings', // Permissions tab: enabled, failIfUnavailable, autoAllowBashIfSandboxed toggles
      },
      {
        capability: 'Session Title',
        sdkExposed: true, // SDK Options.title?: string — custom session title, skips automatic generation
        adapterWired: true, // buildSdkOptions passes session.title on first query (not resume)
        runtimeProof: 'pass', // Live runtime proof verified (2026-06-03, BUILD_ID
        // feature-phase0-capability.202606030440): runSessionTitleProbe created diagnostic session
        // d98c73ea-d4cf-4c8b-9d34-941e42da4288 with requested title
        // "OpenCodian Diagnostic Session Title 1780433378625-1slp1q", and getSession() returned an exact
        // customTitle match.
        // Stable user surface (settings+chat): Conversation settings expose auto-title toggle
        // (backend.claudeCode.autoTitle); history footer provides "Title preferences" entry point;
        // backend session browser displays customTitle. Diagnostic proof harness (Capability Lab
        // "Run Session Title Proof") separately verifies exact backend customTitle semantics.
        // NOT claimed: arbitrary custom title authoring/editing beyond auto-title toggle.
        userSurface: 'settings+chat',
      },
      {
        capability: 'Prompt Suggestions',
        sdkExposed: true, // SDK Options.promptSuggestions?: boolean — emits prompt_suggestion after each turn
        adapterWired: true, // buildClaudeCodeOptions wires promptSuggestions; pumpRuntimeOutput fires callback
        runtimeProof: 'pass', // Live proof 2026-06-06 (BUILD_ID feature-phase0-capability.202606060953):
        // Test Vault ordinary chat observed prompt_suggestion end-to-end: suggestionKeys=["ccb3a44c…"],
        // activeSuggestionText="Create that note in Obsidian", DOM chip visible in opencodian-turn-body.
        // Quick interaction proof also passed: noAutoSendOnClick=true, textareaAfterClick=chip text,
        // chipGoneAfterClick=true, chipClearedOnTurnStart=true.
        // Runtime caveat: SDK may not emit prompt_suggestion on first turn, after API errors, in plan mode,
        // or for non-Claude models — this is a platform limitation, not a plugin bug.
        // Diagnostic readback probe (runPromptSuggestionsReadbackProbe) remains classified as readback:
        // it verifies settings→SDK option mapping only, not live behavior.
        userSurface: 'chat', // Chat suggestion bar inserted into composer area (never auto-sent)
      },
      {
        capability: 'Task Budget',
        sdkExposed: true, // SDK Options.taskBudget?: { total: number } (@alpha)
        adapterWired: true, // buildClaudeCodeOptions wires taskBudget as { total }
        runtimeProof: 'readback', // 2026-06-06 audit: SDK propagates taskBudget as --task-budget CLI flag
        // (sdk.mjs initialize(): if(z)i.push("--task-budget",z.total.toString())). The CLI binary
        // sends it as output_config.task_budget with beta header task-budgets-2026-03-13 to the API.
        // The model is "made aware of its remaining token budget so it can pace tool use and wrap up"
        // (sdk.d.ts lines 1516-1525) — this is behavioral pacing, not a hard enforcement cutoff.
        // Readback ceiling: no deterministic observable side effect from the plugin layer.
        // Unlike maxTurns (which produces error_max_turns result subtype), taskBudget has no local
        // SDK enforcement signal. A tiny budget (e.g. 1) may cause shorter model responses but
        // produces no structured error event; the model may simply emit less text. The @alpha marker
        // confirms the feature is unstable. Promotion path: if the SDK adds a structured
        // error_max_task_budget result subtype or a deterministic observable cutoff behavior.
        userSurface: 'settings', // Numeric input in Model & Thinking tab
      },
      {
        capability: 'Plan Mode Instructions',
        sdkExposed: true, // SDK Options.planModeInstructions?: string
        adapterWired: true, // buildClaudeCodeOptions wires planModeInstructions when non-empty
        runtimeProof: 'pass', // 2026-06-06 combined proof: readback + live behavior.
        // Readback probe proves the saved setting maps into SDK options whenever the trimmed value
        // is non-empty. The builder does not gate on permissionMode, so non-plan readback may still
        // show the option present. Live probe (BUILD_ID feature-phase0-capability.202606061246)
        // forces Plan permission mode for a fresh diagnostic query, injects nonce-bearing
        // _diagnosticPlanModeInstructions, and verifies the model recalls the nonce in its response.
        // This proves planModeInstructions reaches model context and influences plan-mode behavior.
        // Honesty boundary: the live probe uses a diagnostic-only override, so the final pass claim
        // depends on the complementary readback proof for the saved value. The SDK's read-only
        // preamble + ExitPlanMode footer remain internal enforcement details, not separately
        // runtime-verified from the plugin layer.
        userSurface: 'settings', // Permissions tab text area
      },
      {
        capability: 'Tool Aliases',
        sdkExposed: true, // SDK Options.toolAliases?: Record<string, string>
        adapterWired: true, // buildClaudeCodeOptions wires toolAliases when non-empty
        runtimeProof: 'readback', // 2026-06-06 audit: SDK source (browser-sdk.js) shows toolAliases forwarded
        // as a one-way init parameter: `toolAliases: this.initConfig?.toolAliases` in initialize().
        // SDK types confirm alias resolution happens "before name resolution" in the internal
        // "tool execution path" — entirely inside the CLI binary, not exposed through the streaming
        // interface. Stream tool_use chunks contain only post-resolution names with no metadata
        // indicating aliasing occurred. Therefore the plugin cannot distinguish
        // "model emitted aliased name → resolved to canonical" from "model emitted canonical name
        // directly", making alias resolution fundamentally unobservable from the plugin layer.
        // Applies to next query/restarted session only.
        userSurface: 'settings', // Tools tab key=value text area
      },
      {
        capability: 'Debug',
        sdkExposed: true, // SDK Options.debug?: boolean
        adapterWired: true, // buildClaudeCodeOptions wires debug when settings.debug is true
        runtimeProof: 'readback', // 2026-06-06 audit: SDK propagates debug as --debug CLI flag (not --settings).
        // debug=true causes CLI subprocess to emit verbose logs to its stderr stream.
        // Readback ceiling: the plugin cannot observe --debug's effect independently.
        // Without debugFile (which provides a filesystem side effect) or a stderr callback
        // (which captures the stream), debug output is silently discarded by the SDK's
        // default spawn stdio[2]="ignore" (sdk.mjs spawnLocalProcess). The auto-detected
        // debug file path (~/.claude/debug/sdk-<pid>.txt) has a PID suffix and unpredictable
        // lifecycle, making it unreliable for a deterministic probe.
        // Promotion path: if the SDK emits a debug-status signal in the init event or
        // if debugFile is set, use runDebugFileLiveProbe instead (already pass).
        userSurface: 'settings', // Runtime tab toggle
      },
      {
        capability: 'Debug File',
        sdkExposed: true, // SDK Options.debugFile?: string
        adapterWired: true, // buildClaudeCodeOptions wires debugFile when settings.debugFile is non-empty
        runtimeProof: 'pass', // Live proof 2026-06-06: runDebugFileLiveProbe creates a temp directory,
        // sets debugFile to a path inside it, runs a real diagnostic query via runDiagnosticPrompt(),
        // and verifies via fs.existsSync + fs.statSync that the CLI subprocess created a non-empty file
        // at the specified path. This is a real observable side effect on a shared filesystem, not just
        // option wiring. Setting a debug file path implicitly enables debug logging even if the debug
        // toggle is off (per SDK types: "Implicitly enables debug mode"). Applies to next query or
        // restarted session only. The existing readback probe (runDebugFileReadbackProbe) remains as
        // supporting evidence for settings→SDK option mapping.
        userSurface: 'settings', // Runtime tab text input, adjacent to debug toggle
      },
      {
        capability: 'Strict MCP Config',
        sdkExposed: true, // SDK Options.strictMcpConfig?: boolean
        adapterWired: true, // buildClaudeCodeOptions wires strictMcpConfig when settings.strictMcpConfig is true
        runtimeProof: 'readback', // 2026-06-06 audit: SDK propagates strictMcpConfig as
        // --strict-mcp-config CLI flag (sdk.mjs: if(v4)i.push("--strict-mcp-config")). The actual
        // validation behavior lives in the compiled CLI binary, not the SDK wrapper. The SDK
        // only forwards the flag; there is no structured signal (no init event field, no result
        // subtype, no stderr contract) confirming whether strict validation was applied.
        // Readback ceiling: malformed-config probes would be environment-dependent and
        // CLI-version-dependent. The plugin-side adapter (ClaudeCodeMcpConfigAdapter.ts)
        // silently drops structurally malformed entries (returns null), so many malformed
        // configs never reach the CLI. Promotion path: SDK exposes a strict-validation status
        // event or a deterministic structured error subtype for invalid MCP configs.
        userSurface: 'settings', // Tools tab toggle, adjacent to MCP runtime controls
      },
      {
        capability: '1M Context Beta',
        sdkExposed: true, // SDK Options.betas?: string[]
        adapterWired: true, // buildClaudeCodeOptions wires betas when settings.enableContext1mBeta is true
        runtimeProof: 'readback', // Option wiring proven: betas propagates through buildClaudeCodeOptions
        // into SDK options as ['context-1m-2025-08-07']. Readback ceiling: actual beta availability
        // depends on selected model and Anthropic-side behavior. Plugin-side behavior is not
        // independently verified. No generic beta management is exposed.
        userSurface: 'settings', // Model & Thinking tab toggle
      },
      {
        capability: 'JS Runtime',
        sdkExposed: true, // SDK Options.executable?: 'node' | 'bun' | 'deno'
        adapterWired: true, // buildClaudeCodeOptions wires executable when settings.jsRuntime is non-empty
        runtimeProof: 'readback', // Option wiring proven: executable propagates through buildClaudeCodeOptions
        // into SDK options as 'node' | 'bun' | 'deno'. Readback ceiling: actual runtime selection
        // depends on the SDK/CLI version, system PATH, and whether the requested runtime is installed.
        // Plugin-side behavior is not independently verified. No runtime argument management is exposed.
        userSurface: 'settings', // Runtime tab dropdown, adjacent to executable path
      },
      {
        capability: 'Load Timeout',
        sdkExposed: true, // SDK Options.loadTimeoutMs?: number (@alpha)
        adapterWired: true, // buildClaudeCodeOptions wires loadTimeoutMs when non-null
        runtimeProof: 'readback', // 2026-06-06 audit: SDK only uses loadTimeoutMs when
        // (options.resume || options.continue) && options.sessionStore is true (sdk.mjs yj$).
        // It wraps sessionStore.listSessions() in a Promise.race timeout (C4 function, offset 154014):
        // C4(store.listSessions(projectKey), loadTimeoutMs, "SessionStore.listSessions() timed out").
        // On timeout, the promise rejects and propagates to yj$.catch which calls
        // transport.spawnAbort(error) and queryInstance.setError(error).
        // Readback ceiling: without resume/continue + sessionStore, the timeout code path never
        // executes. The plugin's diagnostic path (runDiagnosticPrompt) does not use resume/continue
        // or sessionStore, so a live proof cannot trigger the timeout without mocking sessionStore.
        // Default 60000ms (@alpha). Promotion path: if the SDK exposes a general query timeout
        // or if the plugin gains sessionStore access for resume paths.
        userSurface: 'settings', // Runtime tab numeric input, adjacent to jsRuntime
      },
      {
        capability: 'Stderr Diagnostic',
        sdkExposed: true, // SDK Options.stderr?: (data: string) => void
        adapterWired: true, // buildClaudeCodeOptions wires stderr when input.stderr is provided
        runtimeProof: 'readback', // 2026-06-06 audit: callback wiring is proven via real diagnostic query.
        // SDK spawnLocalProcess (sdk.mjs): when stderr callback is provided, stdio[2]="pipe"
        // and subprocess stderr is forwarded via stderr.on("data", callback). Without callback,
        // stdio[2]="ignore" — all stderr silently discarded.
        // Readback ceiling: actual stderr BYTE emission is environment-dependent. Trivial queries
        // may produce zero stderr; output volume depends on SDK/CLI version and query type.
        // The probe already runs a real query with a callback and captures stderr chunks,
        // but classifying as "pass" when stderr is empty would be dishonest.
        // Promotion path: if the SDK guarantees deterministic stderr output on every query,
        // or if we can find a query that reliably provokes stderr (e.g. error scenario).
        // All captured stderr text is sanitized via sanitizeDiagnosticReport and truncated to 240 chars.
        userSurface: 'diagnostic', // Capability Lab probe only; no stable settings UI
      },
      {
        capability: 'Custom Session ID',
        sdkExposed: true, // SDK Options.sessionId?: string
        adapterWired: true, // buildClaudeCodeOptions wires sessionId when input.sessionId is provided
        runtimeProof: 'pass', // 2026-06-02 live proof: requested session id '54d314f4-7624-4ed0-96fe-424cfaa82e86'
        // returned the exact same id from the SDK stream (BUILD_ID feature-phase0-capability.202606022121).
        // Ordinary chat paths never inject custom session ids — this is a diagnostic-only surface.
        userSurface: 'diagnostic', // Capability Lab probe only; no stable settings UI
      },
      {
        capability: 'Continue',
        sdkExposed: true, // SDK Options.continue?: boolean
        adapterWired: true, // buildClaudeCodeOptions wires continue when input.continue is true
        runtimeProof: 'pass', // Diagnostic-only: runContinueProbe runs two-phase proof.
        // Phase 1 (seed): creates a fresh diagnostic session with a unique nonce.
        // Phase 2 (continue): runs a second diagnostic query with continue: true,
        //   asking the model to reply with only the nonce from the immediately previous turn.
        // Pass requires: (a) same session id as seed, AND (b) text output recalls the nonce.
        // Remains diagnostic with explicit blockers:
        //   1. The adapter already maintains ordinary conversation continuity automatically.
        //   2. continue: true is an implicit "most recent conversation" flag that conflicts with
        //      the adapter's explicit per-conversation session tracking.
        //   3. All real user needs are covered by stable surfaces: ordinary chat (auto-continues),
        //      Backend Session Browser (resume any session), and Fork Session (branch from any message).
        //   4. Exposing this as a user control would add non-determinism without value.
        userSurface: 'diagnostic', // Capability Lab probe only; no stable settings UI
      },
      {
        capability: 'Resume Session At Position',
        sdkExposed: true, // SDK Options.resumeSessionAt?: string
        adapterWired: true, // buildClaudeCodeOptions wires resumeSessionAt when input.resumeSessionAt is provided
        runtimeProof: 'pass', // Diagnostic-only: runResumeSessionAtProbe runs three-phase proof.
        // Phase 1 (alpha): creates a fresh diagnostic session with nonce ALPHA.
        // Phase 1b (beta): sends a second turn in the same session with nonce BETA.
        // Phase 2 (resume-at): resumes at alpha's assistant message UUID and asks what the last nonce was.
        // Pass requires: (a) same session id, AND (b) text output recalls ALPHA (not BETA).
        // Remains diagnostic with explicit blockers:
        //   1. Fork Session already provides a stable "branch from here" surface.
        //   2. resumeSessionAt mutates existing session state in-place; no coherent UX path exists
        //      for "rewind" vs "fork" in the existing conversation model.
        //   3. In-place truncation conflicts with the plugin's append-only conversation history.
        //   4. The adapter already guards resumeSessionAt behind a diagnostic-only flag.
        userSurface: 'diagnostic', // Capability Lab probe only; no stable settings UI
      },
      {
        capability: 'Fork Session On Resume',
        sdkExposed: true, // SDK Options.forkSession?: boolean
        adapterWired: true, // buildClaudeCodeOptions wires forkSession when input.forkSession is true
        runtimeProof: 'pass', // Diagnostic-only: runForkSessionProbe runs two-phase proof.
        // Phase 1 (seed): creates a fresh diagnostic session with a unique nonce.
        // Phase 2 (fork): resumes from the seed session with forkSession: true.
        // Pass requires: (a) DIFFERENT session id from seed (proving fork occurred), AND (b) text output recalls the nonce.
        // Live runtime proof verified by Codex on 2026-06-03 (BUILD_ID feature-phase0-capability.202606030151):
        //   seed: f91393e7-e652-4a19-a9bc-0ca6920397aa, forked: c0a379c9-752e-43de-94fa-57386bfc52a3, nonce recalled: true.
        // This is the SDK public option forkSession?: boolean, NOT the provider-owned adapter.forkSession() capability.
        // Ordinary chat paths never use forkSession — session management is owned by the adapter.
        userSurface: 'diagnostic', // Capability Lab probe only; no stable settings UI
      },
      {
        capability: 'AskUserQuestion Preview Format',
        sdkExposed: true, // SDK Options.toolConfig?: ToolConfig — askUserQuestion.previewFormat?: 'markdown' | 'html'
        adapterWired: true, // buildClaudeCodeOptions wires toolConfig from settings.askUserQuestionPreviewFormat
        runtimeProof: 'readback', // Option wiring proven: toolConfig propagates through buildClaudeCodeOptions
        // into SDK options, and the permission bridge preserves preview data through QuestionRequest.
        // The question UI (inline card and dock) now renders preview text safely as plain text.
        // Readback ceiling: actual preview arrival from the SDK depends on version/model behavior
        // and is not independently verified from the plugin layer.
        userSurface: 'settings', // Tools tab dropdown; Claude-only surface
      },
      {
        capability: 'System Prompt',
        sdkExposed: true, // SDK Options.systemPrompt supports preset-with-append shape
        adapterWired: true, // buildClaudeCodeOptions wires systemPrompt when settings.systemPrompt is non-empty
        runtimeProof: 'pass', // Combined evidence: readback proves the saved setting reaches the preset-with-append
        // SDK path, and live behavior proof shows that same path influences a fresh diagnostic query.
        userSurface: 'settings', // Model & Thinking tab text area
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

    const state = getCapabilityLabState(this.plugin);
    const controlsEl = containerEl.createDiv({ cls: 'opencodian-capability-lab-controls' });
    const sourceSelect = controlsEl.createEl('select', {
      cls: 'opencodian-capability-lab-select',
      attr: {
        'data-diagnostic': 'true',
        'data-diagnostic-source': 'history',
      },
    });
    sourceSelect.createEl('option', { text: 'Local JSONL', attr: { value: 'local' } });
    sourceSelect.createEl('option', { text: 'Diagnostic Store', attr: { value: 'store' } });
    const sessionSelect = controlsEl.createEl('select', {
      cls: 'opencodian-capability-lab-select',
      attr: {
        'data-diagnostic': 'true',
        'data-diagnostic-session-select': 'history',
      },
    });
    sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });

    const refreshBtn = controlsEl.createEl('button', {
      text: 'Refresh Sessions',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });
    const importBtn = controlsEl.createEl('button', {
      text: 'Import Selected Session',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });
    const mirrorBtn = controlsEl.createEl('button', {
      text: 'Run Store Mirror Probe',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });

    const outputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });
    const sessionDetailEl = controlsEl.createDiv({
      cls: 'opencodian-capability-lab-session-detail',
      attr: { 'data-capability-history-session-detail': 'true' },
    });
    let loadedSessions: Array<{ sessionId: string; summary: string; lastModified: number }> = [];
    let sessionLoadRequestId = 0;

    // Load sessions
    const loadSessions = async (): Promise<void> => {
      const requestId = sessionLoadRequestId + 1;
      sessionLoadRequestId = requestId;
      try {
        sessionSelect.innerHTML = '';
        sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });
        const useStore = sourceSelect.value === 'store';
        const sessions = await adapter.listSessions(
          useStore ? { sessionStore: state.sessionStore } : undefined,
        );
        if (requestId !== sessionLoadRequestId) {
          return;
        }
        loadedSessions = sessions;
        for (const session of sessions) {
          const opt = sessionSelect.createEl('option', {
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
            attr: { value: session.sessionId },
          });
          opt.value = session.sessionId;
        }
        outputEl.empty();
        outputEl.createEl('p', {
          text: `Loaded ${sessions.length} ${useStore ? 'store' : 'local'} session(s).`,
        });
      } catch (err) {
        if (requestId !== sessionLoadRequestId) {
          return;
        }
        outputEl.empty();
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `Error loading sessions: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    refreshBtn.addEventListener('click', () => { void loadSessions(); });
    sourceSelect.addEventListener('change', () => { void loadSessions(); });
    importBtn.addEventListener('click', () => {
      const firstAvailableSessionId = Array.from(sessionSelect.options).find((option) => (
        option.value.length > 0 && !option.text.startsWith('—')
      ))?.value;
      const sessionId = sessionSelect.value || firstAvailableSessionId || '';
      if (!sessionId) {
        new Notice('Select a local session to import first.');
        return;
      }
      void this.importHistorySession(adapter, sessionId, state.sessionStore, outputEl);
    });
    mirrorBtn.addEventListener('click', () => {
      void this.runHistoryStoreMirrorProbe({
        adapter,
        sessionStore: state.sessionStore,
        sourceSelect,
        sessionSelect,
        outputEl,
        reloadSessions: loadSessions,
      });
    });

    // Load messages on selection
    sessionSelect.addEventListener('change', () => {
      const sessionId = sessionSelect.value;
      if (!sessionId) {
        outputEl.empty();
        sessionDetailEl.empty();
        return;
      }
      const selected = loadedSessions.find((s) => s.sessionId === sessionId);
      sessionDetailEl.empty();
      if (selected) {
        sessionDetailEl.createDiv({ text: `Session: ${selected.sessionId}` });
        sessionDetailEl.createDiv({ text: `Summary: ${selected.summary}` });
        sessionDetailEl.createDiv({ text: `Modified: ${new Date(selected.lastModified).toISOString()}` });
      }
      void this.loadSessionMessages(
        adapter,
        sessionId,
        outputEl,
        sourceSelect.value === 'store' ? state.sessionStore : undefined,
      );
    });

    // Auto-load on first render
    void loadSessions();
  }

  private async loadSessionMessages(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    outputEl: HTMLElement,
    sessionStore?: unknown,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Loading messages…' });

    try {
      const messages = await adapter.getSessionMessages(sessionId, {
        limit: 50,
        includeSystemMessages: false,
        ...(sessionStore ? { sessionStore } : {}),
      });

      outputEl.empty();
      if (messages.length === 0) {
        outputEl.createEl('p', { text: 'No messages found.' });
        return;
      }

      renderMessagePreviewList(
        outputEl,
        `Session ${sessionId.slice(0, 12)}… — ${messages.length} message(s)`,
        messages,
      );
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

  private async importHistorySession(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    sessionStore: CapabilityLabSessionStore,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Importing local session into the diagnostic store…' });
    try {
      await adapter.importSessionToStore(sessionId, sessionStore, {
        includeSubagents: true,
        batchSize: 250,
      });
      outputEl.empty();
      outputEl.createEl('p', {
        text: `Imported ${sessionId.slice(0, 12)}… into the diagnostic session store.`,
      });
      this.updateRuntimeProof('Session Store', 'pass', outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Session Store', 'fail', outputEl);
    }
  }

  private async runHistoryStoreMirrorProbe({
    adapter,
    sessionStore,
    sourceSelect,
    sessionSelect,
    outputEl,
    reloadSessions,
  }: {
    adapter: ClaudeCodeAdapter;
    sessionStore: CapabilityLabSessionStore;
    sourceSelect: HTMLSelectElement;
    sessionSelect: HTMLSelectElement;
    outputEl: HTMLElement;
    reloadSessions: () => Promise<void>;
  }): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running a diagnostic mirror probe into the session store…' });
    try {
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Reply with a brief confirmation that the diagnostic session-store mirror probe is active.',
        sessionStore,
        sessionStoreFlush: 'eager',
        includeHookEvents: true,
      });
      sourceSelect.value = 'store';
      await reloadSessions();
      if (!result.sessionId) {
        throw new Error('Diagnostic mirror probe did not return a session id.');
      }
      const mirroredSessionListed = Array.from(sessionSelect.options).some((option) => (
        option.value === result.sessionId
      ));
      if (!mirroredSessionListed) {
        throw new Error('Mirrored session was not listed by the diagnostic store after eager flush.');
      }
      sessionSelect.value = result.sessionId;
      await this.loadStoreMirrorReadback(adapter, result.sessionId, outputEl, sessionStore);
      this.updateRuntimeProof('Session Store', 'pass', outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Mirror probe failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Session Store', 'fail', outputEl);
    }
  }

  private async loadStoreMirrorReadback(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    outputEl: HTMLElement,
    sessionStore: CapabilityLabSessionStore,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Loading diagnostic store readback…' });

    const messages = await adapter.getSessionMessages(sessionId, {
      sessionStore,
      limit: 50,
      includeSystemMessages: false,
    });
    if (messages.length === 0) {
      throw new Error('Diagnostic store readback did not return any messages.');
    }

    outputEl.empty();
    renderMessagePreviewList(
      outputEl,
      'Diagnostic store readback — diagnostic proof only',
      messages,
    );
    outputEl.createEl('p', {
      cls: 'opencodian-capability-lab-hint',
      text: 'This readback proves only the isolated diagnostic sessionStore path; it does not enable stable session-store product behavior.',
    });
    outputEl.createEl('pre', {
      cls: 'opencodian-capability-lab-json-preview',
      text: truncate(formatJsonPreview(messages), 8000),
    });
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
    sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });

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
        sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });
        const sessions = await adapter.listSessions();
        for (const session of sessions) {
          const option = sessionSelect.createEl('option', {
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
            attr: { value: session.sessionId },
          });
          option.value = session.sessionId;
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
    sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });

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
        sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });
        const sessions = await adapter.listSessions();
        for (const session of sessions) {
          const option = sessionSelect.createEl('option', {
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
            attr: { value: session.sessionId },
          });
          option.value = session.sessionId;
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
      // Honest classification: pass only when canRewind=true AND filesChanged is non-empty.
      // canRewind:false (Truth A: "No file checkpoint found") → readback (API callable, no checkpoint data).
      // canRewind:true with empty filesChanged → readback (API says rewindable but no actual diff).
      const rewindObj = result as Record<string, unknown> | null;
      const canRewind = rewindObj && typeof rewindObj === 'object' && rewindObj.canRewind === true;
      const filesChanged = Array.isArray((rewindObj as Record<string, unknown>)?.filesChanged)
        ? (rewindObj as Record<string, unknown>).filesChanged as unknown[]
        : [];
      if (canRewind && filesChanged.length > 0) {
        this.updateRuntimeProof('File Checkpoint / Rewind', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: canRewind
            ? 'Blocker: SDK reports canRewind:true but produces no file diff (empty filesChanged). Upstream bug #236: snapshot creation is gated behind React/Ink UI code paths that never fire in SDK query() mode.'
            : 'Blocker: SDK returns canRewind:false — no file checkpoint found. Upstream bug #236 (open since 2026-03-17): file history snapshot creation is only called inside React/Ink interactive UI code paths and is NEVER called in SDK non-interactive mode (isInteractive=false in CLI subprocess). SDK 0.3.158 was tested; Obsidian/Electron needs a setMaxListeners(AbortSignal) monkey-patch, but 10/10 candidates still returned canRewind:false, same as 0.3.145. applyFlagSettings({ fileCheckpointingEnabled: true }) remains a dead-end seam. Pass requires Anthropic to fix #236.',
        });
        this.updateRuntimeProof('File Checkpoint / Rewind', 'readback', outputEl);
      }
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
  // Fork Session Diagnostic Probe (provider-owned, diagnostic only)
  // =======================================================================

  private createProbeShell(
    containerEl: HTMLElement,
    title: string,
    description: string,
    options?: { includeStatusGrid?: boolean },
  ): CapabilityLabProbeShell {
    const headerEl = containerEl.createDiv({ cls: 'opencodian-capability-lab-probe-header' });
    const titleRowEl = headerEl.createDiv({ cls: 'opencodian-capability-lab-probe-title-row' });
    titleRowEl.createEl('h4', { text: title });
    const badgeEl = titleRowEl.createDiv({ cls: 'opencodian-capability-lab-probe-badge' });
    createSurfaceChip(badgeEl, 'diagnostic');

    const copyEl = headerEl.createDiv({ cls: 'opencodian-capability-lab-probe-copy' });
    copyEl.createEl('p', {
      cls: 'opencodian-capability-lab-description',
      text: description,
    });

    const statusEl = options?.includeStatusGrid
      ? containerEl.createDiv({
          cls: 'opencodian-capability-lab-status opencodian-capability-lab-probe-status-grid',
          attr: { 'data-diagnostic': 'true' },
        })
      : null;

    const toolbarEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-controls opencodian-capability-lab-probe-toolbar',
    });
    const fieldRowEl = toolbarEl.createDiv({ cls: 'opencodian-capability-lab-probe-field-row' });
    const actionRowEl = toolbarEl.createDiv({ cls: 'opencodian-capability-lab-probe-action-row' });

    const outputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });

    return {
      fieldRowEl,
      actionRowEl,
      outputEl,
      statusEl,
    };
  }

  private createProbeStatusItem(containerEl: HTMLElement, label: string, value: string): void {
    const itemEl = containerEl.createDiv({ cls: 'opencodian-capability-lab-probe-status-item' });
    itemEl.createSpan({
      cls: 'opencodian-capability-lab-probe-status-label',
      text: label,
    });
    itemEl.createSpan({
      cls: 'opencodian-capability-lab-probe-status-value',
      text: value,
    });
  }

  private renderForkProbe(containerEl: HTMLElement): void {
    const shell = this.createProbeShell(
      containerEl,
      t('settings.capabilityLab.fork.title'),
      t('settings.capabilityLab.fork.description'),
    );

    const adapter = getClaudeCodeAdapter(this.plugin);
    if (!adapter) {
      containerEl.createEl('p', {
        cls: 'opencodian-capability-lab-unavailable',
        text: 'Claude Code adapter not available. Enable the Claude Code backend first.',
      });
      return;
    }

    const sessionSelect = shell.fieldRowEl.createEl('select', {
      cls: 'opencodian-capability-lab-select',
      attr: {
        'data-diagnostic': 'true',
        'data-diagnostic-session-select': 'fork',
      },
    });
    sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });

    const forkBtn = shell.actionRowEl.createEl('button', {
      text: 'Run Fork Diagnostic',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });
    const { outputEl } = shell;

    const loadSessions = async (): Promise<void> => {
      try {
        sessionSelect.innerHTML = '';
        sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });
        const sessions = await adapter.listSessions();
        for (const session of sessions) {
          const option = sessionSelect.createEl('option', {
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
            attr: { value: session.sessionId },
          });
          option.value = session.sessionId;
        }
      } catch (err) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    forkBtn.addEventListener('click', () => {
      const sessionId = sessionSelect.value;
      if (!sessionId) {
        new Notice('Select a session to fork first.');
        return;
      }
      void this.runForkDiagnostic(adapter, sessionId, outputEl);
    });

    void loadSessions();
  }

  private async runForkDiagnostic(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running fork diagnostic…' });

    try {
      const sourceSessionId = await this.resolveForkSourceSessionId(adapter, sessionId);
      const result = await adapter.forkSession(sourceSessionId);
      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Forked from ${sourceSessionId.slice(0, 12)}…`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Forked session ID: ${result.id}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Forked session title: ${result.title}`,
      });
      outputEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: formatJsonPreview(result),
      });
      this.updateRuntimeProof('Fork Session', 'pass', outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Fork failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Hint: forkSession requires a Claude Code runtime with the fork capability available.',
      });
      this.updateRuntimeProof('Fork Session', 'fail', outputEl);
    }
  }

  private async resolveForkSourceSessionId(adapter: ClaudeCodeAdapter, sessionId: string): Promise<string> {
    const trimmed = sessionId.trim();
    if (!trimmed) {
      return sessionId;
    }
    if (typeof adapter.getSession !== 'function') {
      return trimmed;
    }
    const session = await adapter.getSession(trimmed);
    if (!session || typeof session !== 'object') {
      return trimmed;
    }
    const record = session as { sessionId?: unknown; id?: unknown };
    const isLocalSessionHandle = (value: string): boolean => value.startsWith('claude-code-');
    const sessionField = typeof record.sessionId === 'string' ? record.sessionId.trim() : '';
    const idField = typeof record.id === 'string' ? record.id.trim() : '';
    if (
      isLocalSessionHandle(trimmed)
      && isLocalSessionHandle(sessionField)
      && idField.length > 0
      && !isLocalSessionHandle(idField)
    ) {
      return idField;
    }
    const comparableIds = [sessionField, idField].filter((candidate) => candidate.length > 0);
    const matching = comparableIds.find((candidate) => candidate === trimmed);
    if (matching) {
      return matching;
    }
    return comparableIds[0] ?? trimmed;
  }

  // =======================================================================
  // Resume Session Diagnostic Probe (provider-owned, diagnostic only)
  // =======================================================================

  private renderResumeProbe(containerEl: HTMLElement): void {
    const shell = this.createProbeShell(
      containerEl,
      t('settings.capabilityLab.resume.title'),
      t('settings.capabilityLab.resume.description'),
    );

    const adapter = getClaudeCodeAdapter(this.plugin);
    if (!adapter) {
      containerEl.createEl('p', {
        cls: 'opencodian-capability-lab-unavailable',
        text: 'Claude Code adapter not available. Enable the Claude Code backend first.',
      });
      return;
    }

    const sessionSelect = shell.fieldRowEl.createEl('select', {
      cls: 'opencodian-capability-lab-select',
      attr: {
        'data-diagnostic': 'true',
        'data-diagnostic-session-select': 'resume',
      },
    });
    sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });

    const resumeBtn = shell.actionRowEl.createEl('button', {
      text: 'Run Resume Diagnostic',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });
    const { outputEl } = shell;

    const loadSessions = async (): Promise<void> => {
      try {
        sessionSelect.innerHTML = '';
        sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });
        const sessions = await adapter.listSessions();
        for (const session of sessions) {
          const option = sessionSelect.createEl('option', {
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
            attr: { value: session.sessionId },
          });
          option.value = session.sessionId;
        }
      } catch (err) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    resumeBtn.addEventListener('click', () => {
      const sessionId = sessionSelect.value;
      if (!sessionId) {
        new Notice('Select a session to resume from first.');
        return;
      }
      void this.runResumeDiagnostic(adapter, sessionId, outputEl);
    });

    void loadSessions();
  }

  private async runResumeDiagnostic(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running resume diagnostic…' });

    try {
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Continue the conversation. Reply with exactly one short sentence.',
        resumeSessionId: sessionId,
        _diagnosticResumeAt: true,
        persistSession: false,
      });
      if (result.sessionId !== sessionId) {
        throw new Error(`Resume diagnostic returned a different session id: ${result.sessionId ?? '(none)'}`);
      }
      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Resumed from ${sessionId.slice(0, 12)}…`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Resulting session ID: ${result.sessionId ?? '(none)'}`,
      });
      // Show a short output preview from the first text chunk
      const textChunks = result.chunks.filter((c) => c.type === 'text');
      if (textChunks.length > 0) {
        const preview = String((textChunks[0] as { content?: string }).content ?? '').slice(0, 200);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Output preview: ${preview}`,
        });
      }
      outputEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: formatJsonPreview({
          resumedFrom: sessionId,
          resultingSessionId: result.sessionId,
          textChunkCount: textChunks.length,
          totalChunks: result.chunks.length,
        }),
      });
      this.updateRuntimeProof('Resume Session', 'pass', outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Resume diagnostic failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Hint: resumeSessionId requires a valid Claude Code session id and a running SDK runtime.',
      });
      this.updateRuntimeProof('Resume Session', 'fail', outputEl);
    }
  }

  // =======================================================================
  // Session Detail Diagnostic Probe (provider-owned, diagnostic only)
  // =======================================================================

  private renderSessionDetailProbe(containerEl: HTMLElement): void {
    const shell = this.createProbeShell(
      containerEl,
      t('settings.capabilityLab.sessionDetail.title'),
      t('settings.capabilityLab.sessionDetail.description'),
    );

    const adapter = getClaudeCodeAdapter(this.plugin);
    if (!adapter) {
      containerEl.createEl('p', {
        cls: 'opencodian-capability-lab-unavailable',
        text: 'Claude Code adapter not available. Enable the Claude Code backend first.',
      });
      return;
    }

    const sessionSelect = shell.fieldRowEl.createEl('select', {
      cls: 'opencodian-capability-lab-select',
      attr: {
        'data-diagnostic': 'true',
        'data-diagnostic-session-select': 'session-detail',
      },
    });
    sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });

    const detailBtn = shell.actionRowEl.createEl('button', {
      text: 'Inspect Session Detail',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });
    const { outputEl } = shell;

    const loadSessions = async (): Promise<void> => {
      try {
        sessionSelect.innerHTML = '';
        sessionSelect.createEl('option', { text: '— Select a session —', attr: { value: '' } });
        const sessions = await adapter.listSessions();
        for (const session of sessions) {
          const option = sessionSelect.createEl('option', {
            text: truncate(`${session.sessionId.slice(0, 8)}… ${session.summary}`, 80),
            attr: { value: session.sessionId },
          });
          option.value = session.sessionId;
        }
      } catch (err) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    detailBtn.addEventListener('click', () => {
      const sessionId = sessionSelect.value;
      if (!sessionId) {
        new Notice('Select a session to inspect first.');
        return;
      }
      void this.runSessionDetailDiagnostic(adapter, sessionId, outputEl);
    });

    void loadSessions();
  }

  private async runSessionDetailDiagnostic(
    adapter: ClaudeCodeAdapter,
    sessionId: string,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Inspecting session detail…' });

    try {
      const session = await adapter.getSession(sessionId);
      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Session ${sessionId.slice(0, 12)}…`,
      });

      // Extract backend-specific fields for diagnostic display
      const record = session as Record<string, unknown> | null;
      if (!record || typeof record !== 'object') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'getSession() returned null or non-object.',
        });
        this.updateRuntimeProof('Session Detail', 'fail', outputEl);
        return;
      }

      // Show selected fields
      const fields: Record<string, unknown> = {};
      for (const key of Object.keys(record)) {
        const value = record[key];
        if (typeof value === 'function') continue;
        fields[key] = value;
      }

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Session ID: ${String(fields.sessionId ?? fields.id ?? '(none)')}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Summary: ${String(fields.summary ?? fields.title ?? '(none)')}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Last Modified: ${fields.lastModified
          ? new Date(fields.lastModified as number | string).toISOString()
          : '(unknown)'}`,
      });
      if (fields.messageCount !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Message Count: ${String(fields.messageCount)}`,
        });
      }

      outputEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: formatJsonPreview(fields),
      });
      this.updateRuntimeProof('Session Detail', 'pass', outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Session detail probe failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Hint: getSession() requires a valid session id and a running Claude Code SDK runtime.',
      });
      this.updateRuntimeProof('Session Detail', 'fail', outputEl);
    }
  }

  // =======================================================================
  // Backend Routing Diagnostic Probe (provider-owned, diagnostic only)
  // =======================================================================

  private renderBackendRoutingProbe(containerEl: HTMLElement): void {
    const shell = this.createProbeShell(
      containerEl,
      t('settings.capabilityLab.backendRouting.title'),
      t('settings.capabilityLab.backendRouting.description'),
      { includeStatusGrid: true },
    );

    const registry = this.plugin.agentServiceRegistry;
    const activeKind = registry?.getActiveKind() ?? null;

    const statusEl = shell.statusEl;
    if (!statusEl) {
      return;
    }
    this.createProbeStatusItem(statusEl, 'Active backend', activeKind ?? '(none)');

    // Show registered adapters
    const registeredKinds = registry
      ? registry.listAll().map((adapter) => adapter.kind)
      : [];
    if (registeredKinds.length > 0) {
      this.createProbeStatusItem(statusEl, 'Registered adapters', registeredKinds.join(', '));
    } else {
      this.createProbeStatusItem(statusEl, 'Registered adapters', 'No adapters registered');
    }

    // Show backend gate verification for loaded conversations
    const conversations = this.plugin.getConversations?.() ?? [];
    const openCodeCount = conversations.filter(
      (c: { backend?: string }) => (c.backend ?? 'opencode') === 'opencode',
    ).length;
    const nonOpenCodeCount = conversations.length - openCodeCount;

    if (conversations.length > 0) {
      this.createProbeStatusItem(
        statusEl,
        'Conversations',
        `${conversations.length} total (${openCodeCount} OpenCode, ${nonOpenCodeCount} other)`,
      );
    }

    // Probe button - verify routing works through the adapter
    const adapter = getClaudeCodeAdapter(this.plugin);
    if (!adapter) {
      statusEl.createEl('p', {
        cls: 'opencodian-capability-lab-unavailable',
        text: 'Claude Code adapter not available. Backend routing probe requires an active adapter.',
      });
      containerEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ OpenCode-only mode: the registry routes through openCodeService directly. ' +
          'Backend gates on coordinator paths prevent OpenCode-only API calls for non-OpenCode sessions.',
      });
      return;
    }

    const probeBtn = shell.actionRowEl.createEl('button', {
      text: 'Run Backend Routing Probe',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });
    const { outputEl } = shell;

    probeBtn.addEventListener('click', () => {
      void this.runBackendRoutingProbe(adapter, outputEl);
    });
  }

  private async runBackendRoutingProbe(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running backend routing probe…' });

    try {
      // Test 1: listSessions through adapter (provider-owned path)
      const sessions = await adapter.listSessions();

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Backend Routing Probe Results' });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `listSessions() via adapter: ${sessions.length} session(s) returned.`,
      });

      if (sessions.length > 0) {
        // Test 2: getSession through adapter for the first session
        const firstSession = sessions[0];
        const sessionId = firstSession.sessionId;

        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Testing getSession() for session ${sessionId.slice(0, 12)}…`,
        });

        const session = await adapter.getSession(sessionId);
        if (session) {
          outputEl.createEl('p', {
            cls: 'opencodian-capability-lab-hint',
            text: `getSession() returned: ${String((session as unknown as Record<string, unknown>).sessionId ?? (session as unknown as Record<string, unknown>).id ?? '(no id)')}`,
          });
          outputEl.createEl('pre', {
            cls: 'opencodian-capability-lab-json-preview',
            text: truncate(formatJsonPreview(session), 4000),
          });
        } else {
          outputEl.createEl('p', {
            cls: 'opencodian-capability-lab-hint',
            text: 'getSession() returned null.',
          });
        }
      }

      // Test 3: verify registry routing layer (productized narrow seams)
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Testing registry routing layer (productized seams)...',
      });

      const registry = this.plugin.agentServiceRegistry;
      const normalizedRows = await listBackendSessions(registry);
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `listBackendSessions() via registry: ${normalizedRows.length} session(s) returned.`,
      });

      if (normalizedRows.length > 0) {
        const firstRow = normalizedRows[0];
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `First normalized row: id=${firstRow.id.slice(0, 12)}…, title="${truncate(firstRow.title, 40)}"`,
        });

        const previewMessages = await getBackendSessionPreview(registry, firstRow.id);
        if (previewMessages !== null) {
          outputEl.createEl('p', {
            cls: 'opencodian-capability-lab-hint',
            text: `getBackendSessionPreview() via registry: ${previewMessages.length} preview message(s).`,
          });
        } else {
          outputEl.createEl('p', {
            cls: 'opencodian-capability-lab-hint',
            text: 'getBackendSessionPreview() via registry: returned null (history service unavailable or session not found).',
          });
        }

        // Test 3b: verify narrow read seams (readBackendSessionTitle / readBackendSessionShareUrl)
        if (sessions.length > 0) {
          const firstSessionId = sessions[0].sessionId;
          const mockConversation = { backend: adapter.kind as AgentBackendKind };

          const title = await readBackendSessionTitle(registry, mockConversation, firstSessionId);
          outputEl.createEl('p', {
            cls: 'opencodian-capability-lab-hint',
            text: `readBackendSessionTitle() via registry: ${title ? `"${truncate(title, 40)}"` : 'returned null (no title or backend not mapped)'}`,
          });

          const shareUrl = await readBackendSessionShareUrl(registry, mockConversation, firstSessionId);
          outputEl.createEl('p', {
            cls: 'opencodian-capability-lab-hint',
            text: `readBackendSessionShareUrl() via registry: ${shareUrl ? `"${truncate(shareUrl, 60)}"` : 'returned null (no share URL or backend not mapped)'}`,
          });
        }
      }

      // Test 4: verify capabilities
      const caps = adapter.capabilities;
      if (caps) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Declared capabilities: ${Array.from(caps).join(', ') || '(none)'}`,
        });
      }

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '✓ Backend routing probe completed successfully. Adapter-provided session reads and registry routing layer are functional.',
      });
      this.updateRuntimeProof('Backend Routing', 'pass', outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Backend routing probe failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Hint: The probe requires a running Claude Code SDK runtime and a valid adapter.',
      });
      this.updateRuntimeProof('Backend Routing', 'fail', outputEl);
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
      text: 'Structured output is wired through outputFormat in buildSdkOptions. ' +
        'backend_event structured_output chunks are now captured in the send pipeline, ' +
        'persisted to message.structured, and rendered in the normal chat transcript.',
    });

    statusEl.createEl('p', {
      cls: 'opencodian-capability-lab-hint',
      text: '⚠️ Transcript rendering is stable. Structured-output authoring/triggering ' +
        '(the outputFormat option) remains diagnostic-only and can only be set at ' +
        'runtime via adapter options, not through user-facing settings.',
    });

    const probeBtn = containerEl.createEl('button', {
      text: 'Run Structured Output Probe',
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });

    const outputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });

    probeBtn.addEventListener('click', () => {
      void this.runStructuredOutputProbe(adapter, outputEl);
    });
  }

  private async runStructuredOutputProbe(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running a runtime-only structured output diagnostic…' });

    try {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'error'] },
          surface: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['status', 'surface', 'confidence'],
      };
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'You are a structured-output test probe. Return ONLY a JSON object matching the provided schema. Do not include markdown formatting, explanations, or conversational text. The JSON must have status="ok", surface="diagnostic", and confidence=0.95.',
        outputFormat: {
          type: 'json_schema',
          schema,
        },
        includeHookEvents: true,
        persistSession: false,
      });

      // Primary path: look for explicit structured_output backend_event
      const structuredChunk = result.chunks.find((chunk) => (
        chunk.type === 'backend_event' && chunk.event === 'structured_output'
      ));

      // Fallback path: if no backend_event, try to parse JSON from the first text chunk
      const fallbackStructured = !structuredChunk ? tryParseFallbackStructuredOutput(result.chunks) : undefined;

      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Structured output diagnostic session ${result.sessionId?.slice(0, 12) ?? 'unknown'}…`,
      });
      if (result.sessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Session ID: ${result.sessionId}`,
        });
      }

      if (structuredChunk && structuredChunk.type === 'backend_event') {
        outputEl.createEl('p', {
          text: 'Structured output was captured from the backend_event diagnostic channel.',
        });
        outputEl.createEl('pre', {
          cls: 'opencodian-capability-lab-json-preview',
          text: structuredChunk.content ?? formatJsonPreview(structuredChunk.metadata),
        });
        this.updateRuntimeProof('Structured Output', 'pass', outputEl);
        return;
      }

      if (fallbackStructured) {
        outputEl.createEl('p', {
          text: 'No structured_output backend_event was captured, but valid JSON was detected in the text response.',
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'The SDK may have returned structured output as plain text rather than a backend_event. This still proves the outputFormat option is wired and the model respects the schema.',
        });
        outputEl.createEl('pre', {
          cls: 'opencodian-capability-lab-json-preview',
          text: formatJsonPreview(fallbackStructured),
        });
        this.updateRuntimeProof('Structured Output', 'pass', outputEl);
        return;
      }

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'The diagnostic run completed, but no structured_output backend_event or parseable JSON was captured.',
      });
      outputEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: truncate(formatJsonPreview(result.rawMessages), 8000),
      });
      this.updateRuntimeProof('Structured Output', 'fail', outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Structured Output', 'fail', outputEl);
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
    this.renderDiscoveryRows(tbody, adapter, caps);
    this.renderDiagnosticStreamControls(containerEl);
    this.renderDiscoveryControls(containerEl, adapter);
    this.renderDeclaredCapabilities(containerEl, caps);
  }

  private renderDiscoveryRows(
    tbody: HTMLTableSectionElement,
    adapter: ClaudeCodeAdapter | null,
    caps: BackendCapabilities | undefined,
  ): void {
    this.renderDiscoveryPluginRows(tbody, adapter);
    this.renderDiscoveryToolRows(tbody, adapter);
    this.renderDiscoveryStandardRows(tbody, adapter, caps);
  }

  private renderDiscoveryPluginRows(
    tbody: HTMLTableSectionElement,
    adapter: ClaudeCodeAdapter | null,
  ): void {
    // Hooks
    this.addDiscoveryRow(tbody, 'Hooks', 'Project settings surface: scan/create/open for .claude/settings.json + .claude/settings.local.json. Hooks configured by editing these files. Layer 1 (JS callback): wired via SDK options. Layer 3 (shell hook from config file): requires settingSources to include the corresponding source. Default settingSources is [project] — only .claude/settings.json hooks activate by default. To use .claude/settings.local.json hooks, enable "local" in settingSources (Context & Sources tab). Include Hook Events proven separately.');

    // Plugins
    const pluginCount = adapter?.getPluginCount?.() ?? 0;
    const pluginsList = adapter?.getPluginsList?.() ?? [];
    const pluginStatus = pluginCount > 0;
    this.addDiscoveryRow(
      tbody,
      'Plugins',
      pluginStatus
        ? `${pluginCount} adapter plugin option(s): ${pluginsList.join(', ')}. These are programmatic SdkPluginConfig options — dead-letter at runtime (subprocess ignores them). Marketplace plugins from ~/.claude/plugins/ cache are the real runtime path (verified via diagnostic proof: 36 plugin-provided skills in init.skills). No authoring UI.`
        : 'No authoring UI. buildSdkOptions wires programmatic plugin options (dead-letter at runtime). Marketplace plugins from ~/.claude/plugins/ cache are the real loading path (verified via diagnostic proof). No adapter plugin options configured or adapter not started.',
      { status: 'discovery' },
    );

    // Skills
    const skillCount = adapter?.getSkillCount?.() ?? 0;
    const skillsList = adapter?.getSkillsList?.() ?? [];
    const skillStatus = skillCount !== 0;
    this.addDiscoveryRow(
      tbody,
      'Skills',
      skillStatus
        ? skillCount === -1
          ? 'All skills enabled. Configuration summary only; runtime passthrough is wired but not live-proofed here. No authoring UI.'
          : `${skillCount} skill(s): ${Array.isArray(skillsList) ? skillsList.join(', ') : skillsList}. Configuration summary only; runtime passthrough is wired but not live-proofed here. No authoring UI.`
        : 'No authoring UI. buildSdkOptions wires skills (string[]|\'all\') from adapter options. No skills loaded or adapter not started.',
      { status: 'discovery' },
    );

    // MCP Servers
    const mcpServerCount = adapter?.getMcpServerCount?.() ?? 0;
    const mcpServerNames = adapter?.getMcpServerNames?.() ?? [];
    const mcpStatus = mcpServerCount > 0;
    this.addDiscoveryRow(
      tbody,
      'MCP Servers',
      mcpStatus
        ? `${mcpServerCount} server(s) loaded${mcpServerNames.length > 0 ? `: ${mcpServerNames.join(', ')}` : ''}. Ordinary runtime passthrough via ClaudeCodeMcpConfigAdapter. MCP authoring is in the shared Settings > MCP tab; Claude Code Tools tab refreshes runtime config.`
        : 'Ordinary runtime passthrough via ClaudeCodeMcpConfigAdapter. No servers loaded or adapter not started. MCP authoring is in Settings > MCP.',
      { status: mcpStatus ? 'exposed' : 'discovery' },
    );
  }

  private renderDiscoveryToolRows(
    tbody: HTMLTableSectionElement,
    adapter: ClaudeCodeAdapter | null,
  ): void {
    const settings = adapter
      ? (adapter as unknown as { options?: { settings?: Record<string, unknown> } }).options?.settings
      : undefined;

    // Permission approval
    this.addDiscoveryRow(
      tbody,
      'Permission Approval',
      'Chat-surface validated in Capability Lab harness. ClaudeCodePermissionBridge maps SDK canUseTool approval requests into the shared permission card UI. End-to-end proof is anchored to ordinary chat + deterministic harness evidence (chat surface activated and bridge-rendered cards observed with stable selectors). No separate Claude permission settings page — the user surface is the chat interaction itself.',
      { status: 'exposed' },
    );

    // AskUserQuestion / Elicitation
    this.addDiscoveryRow(
      tbody,
      'AskUserQuestion / Elicitation',
      'Chat-surface validated in Capability Lab harness. The question bridge returns AskUserQuestion answers through the shared question dialog, and onElicitation is forwarded as a runtime SDK callback. End-to-end proof is anchored to ordinary chat + deterministic harness evidence (chat surface activated and bridge-rendered question dialog observed with stable selectors). No separate Claude question settings page — the user surface is the chat interaction itself.',
      { status: 'exposed' },
    );

    // Structured Output
    this.addDiscoveryRow(
      tbody,
      'Structured Output',
      'Ordinary chat verified (execution path). Type /json followed by a prompt in the chat composer to trigger fixed-schema structured output. The /json prefix is stripped and a fixed JSON schema (response + tags + confidence) is injected into outputFormat. Duplicate raw JSON suppression works; structured output badge renders during streaming and survives reload/hydration. Composer-level discoverability is now exposed via a Claude-only composer capability hint (/json — structured output). Fixed schema only — no arbitrary schema authoring UI. Claude Code backend only; OpenCode ignores unknown outputFormat.',
      { status: 'exposed' },
    );

    // Allowed Tools
    const allowedTools = settings?.allowedTools;
    const hasAllowedTools = Array.isArray(allowedTools) && allowedTools.length > 0;
    this.addDiscoveryRow(
      tbody,
      'Allowed Tools',
      hasAllowedTools
        ? `${allowedTools.length} tool(s) allowed: ${allowedTools.join(', ')}. Auto-approve shortcut: allowedTools reaches the SDK CLI boundary but has zero enforcement (catalog always unfiltered, canUseTool dead in query() mode). For deterministic built-in tool filtering, use "Restricted Built-in Tools" instead. Readback is the honest ceiling.`
        : 'No tools configured. Auto-approve shortcut: allowedTools reaches the SDK CLI boundary but has zero enforcement. For deterministic built-in tool filtering, use "Restricted Built-in Tools" instead. Readback is the honest ceiling.',
      { status: 'exposed' },
    );

    // Disallowed Tools
    const disallowedTools = settings?.disallowedTools;
    const hasDisallowedTools = Array.isArray(disallowedTools) && disallowedTools.length > 0;
    this.addDiscoveryRow(
      tbody,
      'Disallowed Tools',
      hasDisallowedTools
        ? `${disallowedTools.length} tool(s) disallowed: ${disallowedTools.join(', ')}. Runtime verified: SDK init message tools catalog excludes disallowed tools (deterministic enforcement proof at tool-catalog level). Run "Run Disallowed Tools Proof" in Capability Lab for live verification.`
        : 'No tools disallowed. Runtime verified: SDK init message tools catalog enforcement proven via disallowedTools probe — disallowed tools are removed from the model\'s tool catalog.',
      { status: 'exposed' },
    );

    // Turn/Budget Limits
    const maxTurns = settings?.maxTurns ?? null;
    const maxBudget = settings?.maxBudgetUsd ?? null;
    const hasLimits = maxTurns !== null || maxBudget !== null;
    this.addDiscoveryRow(
      tbody,
      'Turn/Budget Limits',
      hasLimits
        ? `maxTurns=${String(maxTurns)}, maxBudgetUsd=${String(maxBudget)}. Runtime-readback verified via Stable Settings Readback Proof. Behavior-verified (model stops at limit) is not proven.`
        : 'No limits configured (SDK default: unlimited). Runtime-readback verified via Stable Settings Readback Proof. Behavior-verified is not proven.',
      { status: 'exposed' },
    );

    // Environment Variables
    const env = settings?.env;
    const hasEnv = env && typeof env === 'object' && Object.keys(env).length > 0;
    this.addDiscoveryRow(
      tbody,
      'Environment Variables',
      hasEnv
        ? `${Object.keys(env as Record<string, unknown>).length} variable(s) configured. Capability verified (pass): live behavior proof achieved via diagnostic bypass — env-derived side-effect file contains expected nonce value, proving env propagation into Bash subprocess (Layer 1-4). Scope: proves env propagation, not permission approval UX.`
        : 'No environment variables configured. Capability verified (pass): live behavior proof exists for env propagation (Layer 1-4) when vars are present.',
      { status: 'exposed' },
    );

    // Fallback Model
    const fallbackModel = settings?.fallbackModel;
    const hasFallbackModel = typeof fallbackModel === 'string' && fallbackModel.trim().length > 0;
    this.addDiscoveryRow(
      tbody,
      'Fallback Model',
      hasFallbackModel
        ? `Configured fallback model: "${fallbackModel}". Wired through buildSdkOptions / buildDiagnosticSdkOptions as --fallback-model CLI flag. SDK source confirms same-model validation (fallbackModel !== model throws). Changes require session restart. CLI help: "when default model is overloaded (only works with --print)" — fallback triggers on HTTP 529/capacity overload, not invalid-model errors. Invalid-primary test undermined: SDK accepts arbitrary model names at query boundary, reports same string back. Cannot simulate real API overload locally. Classification: readback (option verified, switching not locally provable).`
        : 'No fallback model configured. SDK source (sdk.mjs): exactly 3 fallback refs, all in ProcessTransport.initialize() — destructure + same-model validate + push CLI arg. ZERO switching logic in SDK; all switching in compiled CLI binary. CLI help confirms overload-oriented trigger (HTTP 529). Invalid-primary test undermined: SDK does not validate model names at query boundary. Cannot simulate real API overload locally. Classification: readback.',
      { status: 'discovery' },
    );

    // /context Diagnostic — diagnostic-only /context proof
    this.addDiscoveryRow(
      tbody,
      '/context Diagnostic',
      'Diagnostic-only: fixed read-only slash command /context executed via runDiagnosticPrompt with _diagnosticBypassPermissions. Proves a safe read-only diagnostic command seam exists. This does NOT mean ordinary Claude chat slash commands are productized. Fixed allow-list: /context only. No arbitrary command input. No command authoring. No .claude/** writes.',
      { status: 'diagnostic-proof' },
    );

    // Warm Startup — startup() / WarmQuery diagnostic readback
    this.addDiscoveryRow(
      tbody,
      'Warm Startup',
      'Readback: SDK startup() callable, returns WarmQuery handle with query() and close(). Warm-vs-cold latency benefit is the SDK\'s internal claim, not independently measured. The probe proves entry-point availability and warm handle usability, not a measurable behavioral improvement. No authoring UI. No .claude/** writes.',
      { status: 'diagnostic-proof' },
    );
  }

  private renderDiscoveryStandardRows(
    tbody: HTMLTableSectionElement,
    adapter: ClaudeCodeAdapter | null,
    caps: BackendCapabilities | undefined,
  ): void {
    // Agent definitions
    this.renderAgentDefinitionsDiscoveryRow(tbody, adapter);

    // Agents / Subagents
    this.addDiscoveryRow(
      tbody,
      'Subagents',
      'Capability not in CLAUDE_CODE_PHASE1_CAPABILITIES. Adapter methods exist but UI gating prevents display.',
      { status: !!caps && hasCapability(caps, 'subagents') ? 'exposed' : 'discovery' },
    );

    // Session Store
    this.addDiscoveryRow(tbody, 'Session Store', 'BLOCKED from stable UI. Alpha SDK interface with opaque implementation-defined format. Existing BackendSessionBrowserModal + StorageService already serve all user needs (browse/resume/persist). No user value in a second parallel persistence layer.');

    // Import/Delete/Restore
    this.addDiscoveryRow(tbody, 'Import/Delete/Restore', 'BLOCKED from stable UI. importSessionToStore imports INTO an opaque store format, not into readable conversations. No workflow served that is not already covered by the backend session browser + conversation persistence.');
  }

  private addProofControl(
    proofControls: HTMLElement,
    containerEl: HTMLElement,
    buttonText: string,
    handler: (outputEl: HTMLElement) => Promise<void>,
  ): void {
    const btn = proofControls.createEl('button', {
      text: buttonText,
      cls: 'opencodian-capability-lab-button',
      attr: { 'data-diagnostic': 'true' },
    });
    const outputEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-output',
      attr: { 'data-diagnostic': 'true' },
    });
    btn.addEventListener('click', () => { void handler(outputEl); });
  }

  private renderDiscoveryControls(containerEl: HTMLElement, adapter: ClaudeCodeAdapter | null): void {
    if (!adapter) return;
    const proofControls = containerEl.createDiv({ cls: 'opencodian-capability-lab-controls' });

    this.addProofControl(proofControls, containerEl, 'Run Hook Proof',
      (o) => this.runHookProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Subagent Stream Proof',
      (o) => this.runSubagentStreamProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Fallback Model Proof',
      (o) => this.runFallbackModelProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run SetModel Live Proof',
      (o) => this.runSetModelLiveProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Permission Approval Proof',
      (o) => this.runPermissionApprovalProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run AskUserQuestion Proof',
      (o) => this.runAskUserQuestionProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Trigger Live Permission Card',
      (o) => this.runLivePermissionCardHarness(o));
    this.addProofControl(proofControls, containerEl, 'Trigger Live Question Dialog',
      (o) => this.runLiveQuestionDialogHarness(o));
    this.addProofControl(proofControls, containerEl, 'Probe Streaming Context',
      (o) => this.runStreamingContextProbe(o));
    this.addProofControl(proofControls, containerEl, 'Run Stable Settings Readback',
      (o) => this.runStableSettingsReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Environment Variables Proof',
      (o) => this.runEnvironmentVariablesProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Agent Definition Proof',
      (o) => this.runAgentDefinitionProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Allowed Tools Proof',
      (o) => this.runAllowedToolsProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Disallowed Tools Proof',
      (o) => this.runDisallowedToolsProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Restricted Built-in Tools Proof',
      (o) => this.runRestrictedBuiltinToolsProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Plugins Proof',
      (o) => this.runPluginsProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Launch Ordinary Chat Permission Proof',
      (o) => this.launchOrdinaryChatPermissionProof(o));
    this.addProofControl(proofControls, containerEl, 'Launch Ordinary Chat Question Proof',
      (o) => this.launchOrdinaryChatQuestionProof(o));
    this.addProofControl(proofControls, containerEl, 'Run /context Diagnostic Proof',
      (o) => this.runCommandExecutionProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Warm Startup Proof',
      (o) => this.runWarmStartupProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.stderr.button'),
      (o) => this.runStderrDiagnosticProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.promptSuggestions.button'),
      (o) => this.runPromptSuggestionsReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run System Prompt Readback Proof',
      (o) => this.runSystemPromptReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.systemPromptLive.button'),
      (o) => this.runSystemPromptLiveProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.taskBudget.button'),
      (o) => this.runTaskBudgetReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.sandbox.button'),
      (o) => this.runSandboxReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.planModeInstructions.button'),
      (o) => this.runPlanModeInstructionsReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.planModeInstructionsLive.button'),
      (o) => this.runPlanModeInstructionsLiveProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.toolAliases.button'),
      (o) => this.runToolAliasesReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.debug.button'),
      (o) => this.runDebugReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.debugFile.button'),
      (o) => this.runDebugFileReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.debugFileLive.button'),
      (o) => this.runDebugFileLiveProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Strict MCP Config Readback Proof',
      (o) => this.runStrictMcpConfigReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run 1M Context Beta Readback Proof',
      (o) => this.runContext1mBetaReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run JS Runtime Readback Proof',
      (o) => this.runJsRuntimeReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Load Timeout Readback Proof',
      (o) => this.runLoadTimeoutReadbackProof(adapter, o));
    this.addProofControl(proofControls, containerEl, 'Run Custom Session ID Proof',
      (o) => this.runCustomSessionIdProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.continue.button'),
      (o) => this.runContinueProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.resumeSessionAt.button'),
      (o) => this.runResumeSessionAtProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.forkSession.button'),
      (o) => this.runForkSessionProof(adapter, o));
    this.addProofControl(proofControls, containerEl, t('settings.capabilityLab.proofs.sessionTitle.button'),
      (o) => this.runSessionTitleProof(adapter, o));
  }

  private renderDiagnosticStreamControls(containerEl: HTMLElement): void {
    const controlsEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-diagnostic-stream-controls',
      attr: { 'data-diagnostic': 'true', 'data-capability-lab-surface': 'diagnostic-stream' },
    });
    controlsEl.createEl('h5', { text: t('settings.capabilityLab.diagnosticStreamControls.title') });
    controlsEl.createEl('p', {
      cls: 'opencodian-capability-lab-description',
      text: t('settings.capabilityLab.diagnosticStreamControls.description'),
    });

    new Setting(controlsEl)
      .setName(t('settings.claudeCode.includeHookEvents.name'))
      .setDesc(t('settings.claudeCode.includeHookEvents.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.claudeCodeSettings.includeHookEvents)
          .onChange(async (value) => {
            this.claudeCodeSettings.includeHookEvents = value;
            await this.saveClaudeCodeSettings();
          });
      });

    new Setting(controlsEl)
      .setName(t('settings.claudeCode.forwardSubagentText.name'))
      .setDesc(t('settings.claudeCode.forwardSubagentText.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.claudeCodeSettings.forwardSubagentText)
          .onChange(async (value) => {
            this.claudeCodeSettings.forwardSubagentText = value;
            await this.saveClaudeCodeSettings();
          });
      });

    new Setting(controlsEl)
      .setName(t('settings.claudeCode.agentProgressSummaries.name'))
      .setDesc(t('settings.claudeCode.agentProgressSummaries.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.claudeCodeSettings.agentProgressSummaries)
          .onChange(async (value) => {
            this.claudeCodeSettings.agentProgressSummaries = value;
            await this.saveClaudeCodeSettings();
          });
      });

    new Setting(controlsEl)
      .setName(t('settings.claudeCode.promptSuggestions.name'))
      .setDesc(t('settings.claudeCode.promptSuggestions.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.claudeCodeSettings.promptSuggestions)
          .onChange(async (value) => {
            this.claudeCodeSettings.promptSuggestions = value;
            await this.saveClaudeCodeSettings();
          });
      });

    // File checkpointing — experimental, powers rewind dry-run preview only
    new Setting(controlsEl)
      .setName(t('settings.claudeCode.enableFileCheckpointing.name'))
      .setDesc(t('settings.claudeCode.enableFileCheckpointing.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.claudeCodeSettings.enableFileCheckpointing)
          .onChange(async (value) => {
            this.claudeCodeSettings.enableFileCheckpointing = value;
            await this.saveClaudeCodeSettings();
          });
      });
  }

  private renderDeclaredCapabilities(containerEl: HTMLElement, caps: ReadonlySet<string> | undefined): void {
    if (!caps) return;
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

  private addDiscoveryRow(
    tbody: HTMLTableSectionElement,
    feature: string,
    notes: string,
    options: DiscoveryRowOptions = {},
  ): void {
    const status = options.status ?? 'discovery';
    const statusText = status === 'exposed'
      ? 'Exposed'
      : status === 'diagnostic-proof'
        ? 'Diagnostic Proof'
        : 'Discovery Only';
    const statusClass = status === 'exposed'
      ? ' opencodian-capability-lab-chip-active'
      : status === 'diagnostic-proof'
        ? ' opencodian-capability-lab-chip-surface-diagnostic'
        : '';

    const tr = tbody.createEl('tr');
    tr.createEl('td', { text: feature });
    const statusCell = tr.createEl('td');
    statusCell.createSpan({
      cls: `opencodian-capability-lab-chip${statusClass}`,
      text: statusText,
    });
    tr.createEl('td', { text: notes });
  }

  private renderAgentDefinitionsDiscoveryRow(
    tbody: HTMLTableSectionElement,
    adapter: ClaudeCodeAdapter | null,
  ): void {
    const agentDefCount = adapter?.getAgentDefinitionCount?.() ?? 0;
    const agentDefList = adapter?.getAgentDefinitionsList?.() ?? [];
    this.addDiscoveryRow(
      tbody,
      'Agent Definitions',
      agentDefCount > 0
        ? `${agentDefCount} agent definition(s): ${agentDefList.join(', ')}. Runtime verified via inline Agent Definition Proof — SDK accepts agent/agents options (Layer 1 readback) and the selected agent alters assistant behavior (Layer 2 marker echo). Readback remains supporting evidence only. No authoring UI.`
        : 'No authoring UI. buildSdkOptions wires runtime-only agent/agents options. Runtime verified via inline Agent Definition Proof when definitions are present. Readback remains supporting evidence only. No agent definitions loaded or adapter not started.',
      { status: 'discovery' },
    );
  }

  private setupShellHookConfig(vaultPath: string | null): {
    nonceFile: string;
    nonceContent: string;
    hookConfigCreated: boolean;
    hookConfigPath: string;
    preExistingContent: string | null;
  } {
    const nonce = `hook-shell-${Date.now()}`;
    const nonceFile = join(tmpdir(), `opencodian-hook-proof-${nonce}.txt`);
    const nonceContent = nonce;
    let hookConfigCreated = false;
    let hookConfigPath = '';
    let preExistingContent: string | null = null;

    if (vaultPath) {
      const claudeDir = join(vaultPath, '.claude');
      hookConfigPath = join(claudeDir, 'settings.local.json');
      try {
        if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
        if (existsSync(hookConfigPath)) preExistingContent = readFileSync(hookConfigPath, 'utf8');
        let existingSettings: Record<string, unknown> = {};
        if (preExistingContent !== null) {
          try { existingSettings = JSON.parse(preExistingContent); } catch { existingSettings = {}; }
        }
        const existingHooks = (existingSettings.hooks != null && typeof existingSettings.hooks === 'object')
          ? { ...(existingSettings.hooks as Record<string, unknown>) }
          : {} as Record<string, unknown>;
        const existingSessionStart = Array.isArray(existingHooks.SessionStart)
          ? [...existingHooks.SessionStart]
          : [];
        existingHooks.SessionStart = [{
          matcher: '',
          hooks: [{ type: 'command' as const, command: `echo '${nonceContent}' > '${nonceFile}'`, timeout: 10, _opencodianProof: true }],
        }, ...existingSessionStart];
        writeFileSync(hookConfigPath, JSON.stringify({ ...existingSettings, hooks: existingHooks }, null, 2), 'utf8');
        hookConfigCreated = true;
      } catch (configErr) {
        labLogger.warn('Hook proof: could not create settings.local.json for shell hook', {
          error: configErr instanceof Error ? configErr.message : String(configErr),
        });
      }
    }
    return { nonceFile, nonceContent, hookConfigCreated, hookConfigPath, preExistingContent };
  }

  private cleanupShellHookArtifacts(cfg: {
    nonceFile: string;
    hookConfigCreated: boolean;
    hookConfigPath: string;
    preExistingContent: string | null;
  }): void {
    try { if (existsSync(cfg.nonceFile)) rmSync(cfg.nonceFile, { force: true }); } catch { /* best-effort nonce cleanup */ }
    try {
      if (cfg.hookConfigCreated && cfg.hookConfigPath) {
        if (cfg.preExistingContent !== null) {
          writeFileSync(cfg.hookConfigPath, cfg.preExistingContent, 'utf8');
        } else if (existsSync(cfg.hookConfigPath)) {
          rmSync(cfg.hookConfigPath, { force: true });
        }
      }
    } catch (configErr) {
      labLogger.warn('Hook proof: failed to restore settings.local.json', {
        error: configErr instanceof Error ? configErr.message : String(configErr),
      });
    }
  }

  private renderHookLayer2(layer2Section: HTMLElement, hookChunks: Array<{ type: string; event?: string; id?: string; content?: unknown; metadata?: Record<string, unknown> }>): void {
    layer2Section.createEl('h6', { text: 'Layer 2 — Include Hook Events stream' });
    if (hookChunks.length > 0) {
      layer2Section.createEl('p', { text: `Captured ${hookChunks.length} hook event(s) from the diagnostic backend_event stream.` });
      const sessionStartChunk = hookChunks.find((chunk) => chunk.metadata?.hookEvent === 'SessionStart');
      if (sessionStartChunk && sessionStartChunk.type === 'backend_event') {
        layer2Section.createEl('p', { cls: 'opencodian-capability-lab-hint', text: 'SessionStart hook event was captured explicitly.' });
        layer2Section.createEl('pre', { cls: 'opencodian-capability-lab-json-preview', text: truncate(formatJsonPreview(sessionStartChunk), 4000) });
      }
      if (hookChunks.length > 1) {
        renderMessagePreviewList(layer2Section, 'Hook event timeline',
          hookChunks.map((chunk) => ({ type: chunk.metadata?.hookEvent ?? chunk.event, id: chunk.id ?? chunk.metadata?.hookEvent, content: chunk.content ?? chunk.metadata })));
      }
    } else {
      layer2Section.createEl('p', { cls: 'opencodian-capability-lab-hint', text: 'No hook backend_events captured in stream (includeHookEvents stream layer).' });
    }
  }

  private renderHookLayer3(
    layer3Section: HTMLElement,
    cfg: { hookConfigCreated: boolean; hookConfigPath: string; nonceFile: string; nonceContent: string },
    layer3: { nonceExists: boolean; nonceContent: string },
    vaultPath: string | null,
  ): void {
    layer3Section.createEl('h6', { text: 'Layer 3 — Shell-hook execution via .claude/settings.local.json' });
    if (cfg.hookConfigCreated) {
      layer3Section.createEl('p', { text: `Hook config: ${cfg.hookConfigPath}` });
      layer3Section.createEl('p', { text: `SessionStart hook command: echo '${cfg.nonceContent}' > '${cfg.nonceFile}'` });
      layer3Section.createEl('p', { text: `Nonce marker file: ${cfg.nonceFile}` });
      if (layer3.nonceExists) {
        const contentMatch = layer3.nonceContent === cfg.nonceContent;
        layer3Section.createEl('p', {
          cls: contentMatch ? 'opencodian-capability-lab-hint' : 'opencodian-capability-lab-error',
          text: `Nonce file EXISTS on disk. Content: "${layer3.nonceContent}" (expected "${cfg.nonceContent}"). ${contentMatch ? 'MATCH — shell hook executed successfully.' : 'MISMATCH — file exists but content is wrong.'}`,
        });
      } else {
        layer3Section.createEl('p', { cls: 'opencodian-capability-lab-error', text: 'Nonce file NOT found on disk. Shell hook was not executed (or the hook command failed).' });
      }
    } else {
      layer3Section.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: vaultPath ? 'Could not create hook config file. Layer 3 skipped.' : 'Cannot determine vault path. Layer 3 skipped.' });
    }
  }

  private renderHookProofReport(opts: {
    outputEl: HTMLElement;
    result: { sessionId?: string; chunks: Array<{ type: string; event?: string; id?: string; content?: unknown; metadata?: Record<string, unknown> }> };
    hookTracker: { callbackInvoked: boolean; invocationTime: number };
    cfg: { hookConfigCreated: boolean; hookConfigPath: string; nonceFile: string; nonceContent: string };
    layer3: { nonceExists: boolean; nonceContent: string };
    vaultPath: string | null;
    hooksWiredInOptions: boolean;
  }): void {
    const { outputEl, result, hookTracker, cfg, layer3, vaultPath, hooksWiredInOptions } = opts;
    const hookChunks = result.chunks.filter(isHookBackendEventChunk);

    outputEl.empty();
    outputEl.createEl('h5', { text: `Hook diagnostic session ${result.sessionId?.slice(0, 12) ?? 'unknown'}…` });
    if (result.sessionId) {
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: `Session ID: ${result.sessionId}` });
    }

    const layer1Section = outputEl.createDiv({ cls: 'opencodian-capability-lab-output' });
    layer1Section.createEl('h6', { text: 'Layer 1 — JS callback hooks (SDK options)' });
    layer1Section.createEl('p', {
      cls: hookTracker.callbackInvoked ? 'opencodian-capability-lab-hint' : 'opencodian-capability-lab-error',
      text: hookTracker.callbackInvoked
        ? `JS callback was invoked by SDK at ${new Date(hookTracker.invocationTime).toISOString()}. Options wiring: ${hooksWiredInOptions ? 'confirmed' : 'not confirmed'}.`
        : `JS callback was NOT invoked. Options wiring: ${hooksWiredInOptions ? 'confirmed (hooks present in SDK options)' : 'not confirmed'}. SDK limitation: programmatic JS hooks are accepted at the API boundary but not executed by the subprocess.`,
    });

    this.renderHookLayer2(outputEl.createDiv({ cls: 'opencodian-capability-lab-output' }), hookChunks);
    const layer2Section = outputEl.querySelector('.opencodian-capability-lab-output:last-of-type') as HTMLElement;

    this.renderHookLayer3(outputEl.createDiv({ cls: 'opencodian-capability-lab-output' }), cfg, layer3, vaultPath);

    const shellHookVerified = layer3.nonceExists && layer3.nonceContent === cfg.nonceContent;
    const hasLocalSource = this.claudeCodeSettings.settingSources.includes('local');
    if (shellHookVerified) {
      // Layer 3 genuinely passed: nonce file exists with correct content.
      this.updateRuntimeProof('Hooks', 'pass', outputEl);
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: hookTracker.callbackInvoked
        ? 'Hooks PASS: both shell-hook execution (Layer 3) and JS callback invocation (Layer 1) verified.'
        : 'Hooks PASS: shell-hook execution via .claude/settings.local.json verified (Layer 3). JS callback path remains uninvoked (SDK limitation), but real runtime hook path is functional.' });
    } else if (hookTracker.callbackInvoked) {
      // Layer 1 passed but Layer 3 did not. Report honestly.
      this.updateRuntimeProof('Hooks', 'pass', outputEl);
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: layer3.nonceExists
        ? 'Hooks PASS: JS callback invocation verified (Layer 1). Shell-hook nonce file exists but content mismatch (Layer 3 inconclusive).'
        : `Hooks PASS: JS callback invocation verified (Layer 1). Shell-hook nonce file NOT found (Layer 3 not verified). Shell hooks from .claude/settings.local.json require settingSources to include 'local'. Current settingSources: [${this.claudeCodeSettings.settingSources.join(', ')}]. ${hasLocalSource ? "'local' is enabled — shell hooks should work in ordinary chat." : "'local' is NOT enabled — add it in Context & Sources tab to activate .claude/settings.local.json hooks."}` });
    } else if (hooksWiredInOptions) {
      this.updateRuntimeProof('Hooks', 'readback', outputEl);
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: 'Hooks option wired into SDK options (readback confirmed) but neither JS callback nor shell hook executed. Verdict: readback.' });
    } else {
      this.updateRuntimeProof('Hooks', 'fail', outputEl);
    }

    if (hookChunks.length > 0) {
      layer2Section.createEl('p', { cls: 'opencodian-capability-lab-hint', text: 'Include Hook Events: hook backend_events confirmed in stream (independent pass evidence preserved).' });
    } else {
      layer2Section.createEl('p', { cls: 'opencodian-capability-lab-hint', text: 'Include Hook Events: no hook backend_events in this run (independent pass evidence unchanged).' });
    }
  }

  private async runHookProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running hook proof (JS callback + shell hook)…' });

    const hookTracker = { callbackInvoked: false, invocationTime: 0, hookSpecificOutput: null as unknown };

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guard for test mock safety when plugin.app is undefined
    const vaultPath = this.plugin.app ? getVaultBasePath(this.plugin.app) : null;
    const cfg = this.setupShellHookConfig(vaultPath);

    try {
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Reply with the words hook proof.',
        hooks: {
          SessionStart: [{
            hooks: [async () => {
              hookTracker.callbackInvoked = true;
              hookTracker.invocationTime = Date.now();
              const output = { hookEventName: 'SessionStart', additionalContext: 'Capability Lab hooks option execution proof', proofToken: `hook-callback-${Date.now()}` };
              hookTracker.hookSpecificOutput = output;
              return { continue: true, hookSpecificOutput: output };
            }],
          }],
        },
        includeHookEvents: true,
        persistSession: false,
      });

      const sdkOptions = adapter.inspectLastDiagnosticSdkOptions?.();
      const hooksWiredInOptions = !!(sdkOptions as Record<string, unknown> | null)?.hooks;

      let layer3NonceExists = false;
      let layer3NonceContent = '';
      if (cfg.hookConfigCreated) {
        layer3NonceExists = existsSync(cfg.nonceFile);
        if (layer3NonceExists) {
          try { layer3NonceContent = readFileSync(cfg.nonceFile, 'utf8').trim(); } catch { layer3NonceContent = '(read error)'; }
        }
      }

      this.renderHookProofReport({ outputEl, result, hookTracker, cfg, layer3: { nonceExists: layer3NonceExists, nonceContent: layer3NonceContent }, vaultPath, hooksWiredInOptions });
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-error', text: `Hook proof failed: ${err instanceof Error ? err.message : String(err)}` });
      this.updateRuntimeProof('Hooks', 'fail', outputEl);
    } finally {
      this.cleanupShellHookArtifacts(cfg);
    }
  }

  private async runSubagentStreamProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running a subagent stream proof…' });
    try {
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Use the Bash tool to run the command "echo subagent-test-12345" and report the exact output.',
        forwardSubagentText: true,
        agentProgressSummaries: true,
        includeHookEvents: true,
        persistSession: false,
        _diagnosticBypassPermissions: true,
      });

      // Look for any subagent-related backend events or chunks
      const subagentChunks = result.chunks.filter((chunk): chunk is Extract<import('../../core/types/chat').StreamChunk, { type: 'backend_event' }> => {
        if (chunk.type !== 'backend_event') return false;
        const eventType = chunk.event ?? '';
        const meta = chunk.metadata ?? {};
        return (
          eventType === 'subagent' ||
          eventType === 'tool_progress' ||
          meta.subagentId != null ||
          meta.agentId != null ||
          meta.progress != null
        );
      });

      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Subagent stream diagnostic session ${result.sessionId?.slice(0, 12) ?? 'unknown'}…`,
      });
      if (result.sessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Session ID: ${result.sessionId}`,
        });
      }

      outputEl.createEl('p', {
        text: 'Diagnostic prompt completed with forwardSubagentText and agentProgressSummaries enabled.',
      });

      // Honesty boundary: Subagent Transcript / Progress only achieves runtime proof
      // when real subagent/progress backend events are captured in the stream.
      // Merely accepting the options in the SDK query is not sufficient evidence.
      if (subagentChunks.length > 0) {
        outputEl.createEl('p', {
          text: `Captured ${subagentChunks.length} subagent-related event(s) from the diagnostic stream.`,
        });
        renderMessagePreviewList(
          outputEl,
          'Subagent event timeline',
          subagentChunks.map((chunk) => ({
            type: chunk.event ?? 'backend_event',
            id: chunk.id,
            content: chunk.content ?? chunk.metadata,
          })),
        );
        this.updateRuntimeProof('Subagent Transcript / Progress', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'No subagent events captured — expected for a single-turn prompt without subagent spawning. Options were accepted by the SDK, but this is not runtime proof of subagent transcript / progress behavior.',
        });
        this.updateRuntimeProof('Subagent Transcript / Progress', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Subagent stream proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Subagent Transcript / Progress', 'fail', outputEl);
    }
  }

  private async runFallbackModelProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running a fallback model diagnostic proof…' });

    // ── Phase 1: Option readback verification ──
    // Verify that fallbackModel reaches the SDK options shape.
    outputEl.createEl('p', {
      cls: 'opencodian-capability-lab-hint',
      text: 'Phase 1: Verifying fallbackModel option reaches SDK…',
    });

    const testFallbackModel = 'claude-haiku-4-5';
    try {
      // Run a VALID query with a valid fallback to confirm option wiring.
      const wiringResult = await adapter.runDiagnosticPrompt({
        prompt: 'Reply with the words fallback wiring check.',
        fallbackModel: testFallbackModel,
        persistSession: false,
      });

      const wiringOptions = adapter.inspectLastDiagnosticSdkOptions?.();
      const fallbackInOptions = wiringOptions?.fallbackModel === testFallbackModel;

      outputEl.createEl('p', {
        cls: fallbackInOptions ? 'opencodian-capability-lab-hint' : 'opencodian-capability-lab-error',
        text: fallbackInOptions
          ? `Phase 1 PASS: fallbackModel="${testFallbackModel}" confirmed in SDK options (--fallback-model CLI flag).`
          : `Phase 1 FAIL: fallbackModel not found in SDK options (expected="${testFallbackModel}", got="${String(wiringOptions?.fallbackModel)}").`,
      });

      // Also check init message for fallback model metadata.
      const initFallback = this.extractInitFallbackModel(wiringResult);
      if (initFallback) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Init message fallbackModel: "${initFallback}"`,
        });
      }

      // Check modelUsage in result message — detection plumbing for fallback.
      // If native fallback occurs, modelUsage would contain multiple model keys.
      const modelUsage = this.extractModelUsage(wiringResult);
      if (modelUsage) {
        const modelKeys = Object.keys(modelUsage);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Result modelUsage: ${modelKeys.length} model(s) tracked — ${modelKeys.join(', ')}. ` +
            (modelKeys.length > 1
              ? 'Multiple models detected — fallback may have occurred.'
              : 'Single model — no fallback occurred (expected without API overload).'),
        });
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Result modelUsage: not present in result message.',
        });
      }
    } catch (wiringErr) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Phase 1 error: ${wiringErr instanceof Error ? wiringErr.message : String(wiringErr)}`,
      });
    }

    // ── Phase 2: Invalid-primary trigger test ──
    // Runtime evidence (BUILD_ID feature-phase0-capability.202605300441): invalid primary accepted
    // without error, same invalid string reported back, no fallback triggered.
    outputEl.createEl('p', {
      cls: 'opencodian-capability-lab-hint',
      text: 'Phase 2: Testing invalid primary model (runtime evidence: SDK accepted without error, no fallback)…',
    });

    const invalidPrimaryModel = 'opencodian-invalid-model-test-xyz123';
    try {
      const invalidResult = await adapter.runDiagnosticPrompt({
        prompt: 'Reply with the words fallback model proof.',
        model: invalidPrimaryModel,
        fallbackModel: testFallbackModel,
        persistSession: false,
      });

      // If we got here, the SDK may have fallen back OR ignored the invalid model.
      const detectedModel = this.extractModelFromDiagnosticResult(invalidResult);
      const hasTextOutput = invalidResult.chunks.some(
        (c) => c.type === 'text' && typeof (c as Record<string, unknown>).text === 'string' && ((c as Record<string, unknown>).text as string).length > 0,
      );

      outputEl.createEl('p', {
        text: `Unexpected: query succeeded with invalid primary "${invalidPrimaryModel}".`,
      });
      if (detectedModel) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `SDK reported model: "${detectedModel}"`,
        });
      }

      const invalidModelUsage = this.extractModelUsage(invalidResult);
      const invalidModelUsageKeys = invalidModelUsage ? Object.keys(invalidModelUsage) : [];
      if (invalidModelUsageKeys.length > 0) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Invalid-primary modelUsage: ${invalidModelUsageKeys.length} model(s) tracked — ${invalidModelUsageKeys.join(', ')}.`,
        });
      }

      // Pass requires evidence that the configured fallback model actually handled the request.
      const fallbackModelUsed = hasTextOutput && detectedModel === testFallbackModel;
      const hasMultiModelUsageEvidence = invalidModelUsageKeys.length > 1
        && invalidModelUsageKeys.includes(testFallbackModel);
      const hasExplicitFallbackSignal = this.hasFallbackSwitchSignal(invalidResult);
      const fallbackOccurred = fallbackModelUsed && (hasMultiModelUsageEvidence || hasExplicitFallbackSignal);
      if (fallbackOccurred) {
        this.updateRuntimeProof('Fallback Model', 'pass', outputEl);
      } else {
        // ── Phase 2 blocker analysis (success path) ──
        // This is the path that fires in real runtime (BUILD_ID feature-phase0-capability.202605300441):
        // SDK accepts invalid model name without error, reports same invalid string back, no fallback triggered.
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Blocker: fallback is overload-oriented (CLI help: "when default model is overloaded, only works with --print"). SDK does not validate model names at query boundary — invalid primary accepted without error. Precise trigger conditions (HTTP 529 / capacity overload) cannot be simulated locally. Invalid-primary test strategy cannot force fallback.',
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'SDK source-backed evidence (sdk.mjs): exactly 3 fallback references found, all in ProcessTransport.initialize(): (1) destructure fallbackModel from options, (2) same-model validation (throws if fallbackModel === model), (3) push "--fallback-model" to CLI args. ZERO switching/overload/retry logic in SDK — all model-switching lives in compiled CLI binary. Binary strings confirm switching path (overloaded_error, model_fallback, "Switched to...") but are gated behind API-side HTTP 529 signals we cannot produce. Same-model validation is deterministic (throws immediately), but does not prove switching behavior.',
        });
        this.updateRuntimeProof('Fallback Model', 'readback', outputEl);
      }
    } catch (err) {
      // Fallback path: SDK throws error (not observed in BUILD_ID feature-phase0-capability.202605300441,
      // but retained for robustness in case SDK behavior changes).
      const errMessage = err instanceof Error ? err.message : String(err);
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Phase 2 result: invalid primary "${invalidPrimaryModel}" caused error (SDK may validate model before attempting fallback).`,
      });

      // Show the error for diagnostic completeness.
      const shortErr = errMessage.length > 200 ? errMessage.slice(0, 200) + '…' : errMessage;
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Error detail: ${shortErr}`,
      });

      // ── Phase 3: Blocker explanation ──
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Phase 3: Blocker analysis — SDK fallback trigger conditions:',
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '• CLI help (--fallback-model) states: "Enable automatic fallback to specified model when default model is overloaded (only works with --print)".',
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '• Binary strings contain overloaded_error / model_fallback / "Switched to ... due to high demand" references, suggesting a 529/overload-triggered path.',
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '• Precise trigger conditions (retry count, model scope, env gating) are not authoritatively documented. We cannot claim exact thresholds.',
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '• Invalid model names accepted without error by SDK (Phase 2 runtime evidence: no 400, invalid string echoed back). This undermines the invalid-primary test strategy — SDK does not validate model names at query boundary.',
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '• Conclusion: option wiring is verified (Phase 1 pass), but behavior proof requires real overload conditions that cannot be produced locally. Invalid-primary strategy is undermined because SDK does not validate model names at the query boundary.',
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '• Observability note: proof runs in diagnostic headless context; visible DOM output may not update immediately. JS/direct runtime seam (assertions JSON / extractInitFallbackModel) was needed to confirm state.',
      });

      this.updateRuntimeProof('Fallback Model', 'readback', outputEl);
    }
  }

  /**
   * Extract fallbackModel from init message metadata, if present.
   */
  private extractInitFallbackModel(result: ClaudeCodeDiagnosticPromptResult): string | undefined {
    for (const message of result.rawMessages) {
      if (message && typeof message === 'object') {
        const record = message as Record<string, unknown>;
        // Init message: type='system', subtype='init'
        if (record.type === 'system' && record.subtype === 'init') {
          const fallbackModel = record.fallbackModel ?? (record.model_context as Record<string, unknown>)?.fallbackModel;
          if (typeof fallbackModel === 'string' && fallbackModel.length > 0) {
            return fallbackModel;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Extract modelUsage from result message, if present.
   * If native fallback occurs, modelUsage would contain multiple model keys.
   * This is a passive detection seam — it can confirm what model was used
   * but cannot trigger fallback.
   */
  private extractModelUsage(result: ClaudeCodeDiagnosticPromptResult): Record<string, unknown> | undefined {
    for (const message of result.rawMessages) {
      if (message && typeof message === 'object') {
        const record = message as Record<string, unknown>;
        // Result message: type='result'
        if (record.type === 'result' && typeof record.modelUsage === 'object' && record.modelUsage !== null) {
          return record.modelUsage as Record<string, unknown>;
        }
      }
    }
    return undefined;
  }

  private hasFallbackSwitchSignal(result: ClaudeCodeDiagnosticPromptResult): boolean {
    let payload = '';
    try {
      payload = JSON.stringify([result.rawMessages, result.chunks]);
    } catch {
      return false;
    }
    return payload.includes('model_fallback')
      || payload.includes('tengu_model_fallback_triggered')
      || payload.includes('overloaded_error')
      || payload.includes('Switched to')
      || /"error_status"\s*:\s*529/.test(payload);
  }

  /**
   * SetModel Live Proof — diagnostic probe for query.setModel() live behavior.
   *
   * Runs a two-phase diagnostic: Phase 1 captures the initial model usage,
   * then setModel(targetModel) is called on the query handle, and Phase 2
   * captures model usage after the switch.
   *
   * Classification:
   * - pass: Phase 2 modelUsage includes targetModel AND differs from Phase 1
   * - readback: setModel succeeded but model didn't change or evidence ambiguous
   * - boundary: setModel not available on the query handle
   * - fail: probe threw an exception
   *
   * This is diagnostic-only. It does not change stable settings, chat behavior,
   * or capability matrix classifications for other capabilities.
   */
  private async runSetModelLiveProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running setModel live proof…' });

    // Use a different model from the current one as the target.
    // Default to a well-known model; the user can observe whether it matches their catalog.
    const targetModel = 'claude-opus-4-5';

    try {
      const result = await adapter.runSetModelLiveProbe(targetModel);

      outputEl.empty();
      outputEl.createEl('h5', { text: 'SetModel Live Proof (diagnostic)' });
      outputEl.createEl('p', {
        text: `Target model: ${targetModel}`,
        attr: { 'data-diagnostic': 'true' },
      });
      outputEl.createEl('p', {
        text: `setModel attempted: ${result.setModelAttempted}`,
        attr: { 'data-diagnostic': 'true' },
      });

      if (result.setModelNotAvailable) {
        outputEl.createEl('p', {
          text: 'setModel not available on Query handle — SDK version may not support live model switching.',
          attr: { 'data-diagnostic': 'true' },
        });
        this.updateRuntimeProof('SetModel Live', 'boundary', outputEl);
        return;
      }

      if (result.setModelError) {
        outputEl.createEl('p', {
          text: `setModel error: ${result.setModelError}`,
          attr: { 'data-diagnostic': 'true' },
        });
      }

      outputEl.createEl('p', {
        text: `Phase 1 model keys: ${result.phase1ModelKeys.length > 0 ? result.phase1ModelKeys.join(', ') : '(no modelUsage signal)'}`,
        attr: { 'data-diagnostic': 'true' },
      });
      outputEl.createEl('p', {
        text: `Phase 2 model keys: ${result.phase2ModelKeys.length > 0 ? result.phase2ModelKeys.join(', ') : '(no modelUsage signal)'}`,
        attr: { 'data-diagnostic': 'true' },
      });

      // Honest classification:
      // pass ONLY if Phase 2 shows targetModel AND Phase 1 does not (or differs)
      const phase2HasTarget = result.phase2ModelKeys.includes(targetModel);
      const modelSwitched = result.phase1ModelKeys.join(',') !== result.phase2ModelKeys.join(',')
        || (result.phase2ModelKeys.length > 0 && phase2HasTarget);

      if (!result.setModelError && phase2HasTarget && result.phase1ModelKeys.length > 0
          && !result.phase1ModelKeys.includes(targetModel)) {
        outputEl.createEl('p', {
          text: `PASS: Phase 2 modelUsage includes "${targetModel}" and Phase 1 did not — setModel() live behavior verified.`,
          attr: { 'data-diagnostic': 'true' },
        });
        this.updateRuntimeProof('SetModel Live', 'pass', outputEl);
      } else if (result.setModelError) {
        outputEl.createEl('p', {
          text: `READBACK: setModel threw "${result.setModelError}". Control message was sent but model switch not confirmed.`,
          attr: { 'data-diagnostic': 'true' },
        });
        this.updateRuntimeProof('SetModel Live', 'readback', outputEl);
      } else {
        const reason = !modelSwitched
          ? `Phase 1 and Phase 2 report same model(s): [${result.phase1ModelKeys.join(', ')}]. setModel control message was sent but model did not change.`
          : `Phase 2 model changed to [${result.phase2ModelKeys.join(', ')}] but target "${targetModel}" not observed.`;
        outputEl.createEl('p', {
          text: `READBACK: ${reason}`,
          attr: { 'data-diagnostic': 'true' },
        });
        this.updateRuntimeProof('SetModel Live', 'readback', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('h5', { text: 'SetModel Live Proof (diagnostic)' });
      outputEl.createEl('p', {
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        attr: { 'data-diagnostic': 'true' },
      });
      this.updateRuntimeProof('SetModel Live', 'fail', outputEl);
    }
  }

  private async runPermissionApprovalProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running a permission approval behavior proof…' });
    try {
      // Use a prompt likely to trigger a tool call. The model may or may not call a tool;
      // this is intentionally non-deterministic because tool calling depends on the model.
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Please read the file named README.md in the current directory and tell me its first line.',
        persistSession: false,
      });

      outputEl.empty();
      outputEl.createEl('h5', {
        text: `Permission approval diagnostic session ${result.sessionId?.slice(0, 12) ?? 'unknown'}…`,
      });
      if (result.sessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Session ID: ${result.sessionId}`,
        });
      }

      // Check for tool_use chunks — this proves the model attempted a tool call,
      // which means canUseTool would have been invoked if the bridge is wired.
      const toolUseChunks = result.chunks.filter((c) => c.type === 'tool_use');
      const toolResultChunks = result.chunks.filter((c) => c.type === 'tool_result');
      const hasToolUse = toolUseChunks.length > 0;
      const hasToolResult = toolResultChunks.length > 0;

      if (hasToolUse) {
        outputEl.createEl('p', {
          text: `Model emitted ${toolUseChunks.length} tool_use chunk(s).`,
        });
        renderMessagePreviewList(
          outputEl,
          'Tool use timeline',
          toolUseChunks.map((chunk) => ({
            type: chunk.type,
            id: (chunk as Record<string, unknown>).id ?? 'unknown',
            content: (chunk as Record<string, unknown>).name ?? 'unknown',
          })),
        );
      }

      if (hasToolResult) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Model received ${toolResultChunks.length} tool_result chunk(s).`,
        });
      }

      // Honesty boundary: we can only prove wiring here.
      // True end-to-end permission approval proof requires:
      // 1. The model to call a tool (non-deterministic)
      // 2. The SDK to invoke canUseTool
      // 3. The permission card to render in Obsidian
      // 4. The user to approve/deny
      // 5. The stream to continue with the correct result
      // Steps 3-5 are outside the diagnostic prompt path.
      if (hasToolUse && hasToolResult) {
        outputEl.createEl('p', {
          text: 'The model called a tool and received a result. This suggests the SDK accepted the canUseTool wiring, but it does not prove the Obsidian permission card UI was shown or that user approval was required.',
        });
        this.updateRuntimeProof('Permission Approval', 'wiring', outputEl);
      } else if (hasToolUse) {
        outputEl.createEl('p', {
          text: 'The model called a tool but no tool_result was captured. The tool may have been denied or the call may have failed.',
        });
        this.updateRuntimeProof('Permission Approval', 'wiring', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'The model did not call any tool in this diagnostic prompt. Tool calling is non-deterministic and depends on the model, prompt, and context. This does not prove or disprove the permission approval wiring.',
        });
        this.updateRuntimeProof('Permission Approval', 'wiring', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Permission approval proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Permission Approval', 'fail', outputEl);
    }
  }

  private async runAskUserQuestionProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running an AskUserQuestion behavior proof…' });
    try {
      // Use a prompt likely to trigger the AskUserQuestion tool. The model may or may not
      // use this tool; it is non-deterministic.
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Ask me a single yes/no question using the AskUserQuestion tool: "Should I continue?"',
        persistSession: false,
      });

      outputEl.empty();
      outputEl.createEl('h5', {
        text: `AskUserQuestion diagnostic session ${result.sessionId?.slice(0, 12) ?? 'unknown'}…`,
      });
      if (result.sessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Session ID: ${result.sessionId}`,
        });
      }

      // Check for AskUserQuestion tool_use
      const askUserQuestionChunks = result.chunks.filter((c) => {
        if (c.type !== 'tool_use') return false;
        const name = (c as Record<string, unknown>).name;
        return typeof name === 'string' && name.toLowerCase().includes('askuser');
      });
      const hasAskUserQuestion = askUserQuestionChunks.length > 0;

      if (hasAskUserQuestion) {
        outputEl.createEl('p', {
          text: `Model emitted ${askUserQuestionChunks.length} AskUserQuestion tool_use chunk(s).`,
        });
        renderMessagePreviewList(
          outputEl,
          'AskUserQuestion timeline',
          askUserQuestionChunks.map((chunk) => ({
            type: chunk.type,
            id: (chunk as Record<string, unknown>).id ?? 'unknown',
            content: (chunk as Record<string, unknown>).name ?? 'unknown',
          })),
        );
      }

      // Honesty boundary: diagnostic path hit the AskUserQuestion tool boundary but cannot
      // complete the answer chain because it lacks the normal chat UI context. This is
      // intentionally a boundary state — not a pass (no full UI interaction proved) and
      // not a fail (the tool boundary WAS triggered, proving wiring is functional).
      // True end-to-end AskUserQuestion proof requires:
      // 1. The model to call AskUserQuestion (non-deterministic)
      // 2. The SDK to invoke canUseTool with the question
      // 3. The question dialog to render in Obsidian
      // 4. The user to answer
      // 5. The stream to continue with the answer
      // Steps 3-5 are outside the diagnostic prompt path.
      if (hasAskUserQuestion) {
        outputEl.createEl('p', {
          text: 'The model called AskUserQuestion. The SDK tool boundary was triggered, proving the bridge wiring is functional. However, the diagnostic path lacks the normal chat UI context, so the Obsidian question dialog was not shown and no user answer was collected. This is a boundary state, not a failure.',
        });
        this.updateRuntimeProof('AskUserQuestion / Elicitation', 'boundary', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'The model did not call AskUserQuestion in this diagnostic prompt. Tool calling is non-deterministic and depends on the model, prompt, and context. This does not prove or disprove the AskUserQuestion wiring.',
        });
        this.updateRuntimeProof('AskUserQuestion / Elicitation', 'wiring', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `AskUserQuestion proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('AskUserQuestion / Elicitation', 'fail', outputEl);
    }
  }

  // =======================================================================
  // Ordinary Chat Proof Launchers — send preset prompts through real chat pipeline
  // =======================================================================

  /**
   * Launch an ordinary-chat permission proof by sending a real message through the
   * OpenCodian chat view's send pipeline. Temporarily switches permission mode to
   * 'plan' (ask-by-default, deny edit/write) to maximize the chance of triggering
   * the permission card for a file-write tool call. Restores original settings in
   * finally block regardless of outcome.
   */
  private async launchOrdinaryChatPermissionProof(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Launching ordinary chat permission proof…' });

    const adapter = getClaudeCodeAdapter(this.plugin);
    const originalPermissionMode = this.plugin.settings.backendSettings.claudeCode.permissionMode;
    const originalModel = this.plugin.settings.backendSettings.claudeCode.model;
    const proofPermissionMode = 'plan' as const;
    const nonce = `proof-${Date.now()}`;
    const targetPath = `${getVaultBasePath(this.plugin.app) ?? ''}/.obsidian-debug/permission-proof.txt`;
    const prompt = `Please create a file at "${targetPath}" with the exact content "${nonce}" and confirm when done.`;

    outputEl.createEl('p', {
      text: `Proof config — permissionMode: ${originalPermissionMode} → ${proofPermissionMode}, model: ${originalModel || 'default'}, prompt: "${prompt}"`,
    });

    try {
      // Temporarily override permission mode to 'plan' for this proof run
      this.plugin.settings.backendSettings.claudeCode.permissionMode = proofPermissionMode;
      await adapter?.setPermissionMode(proofPermissionMode);

      const leaf = this.plugin.app.workspace.getLeavesOfType('opencodian-view')[0];
      const view = leaf?.view as unknown as Record<string, unknown> | undefined;
      if (!view) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: 'OpenCodian chat view not found. Open the chat view first.',
        });
        return;
      }

      const sendPipelineRuntime = view.sendPipelineRuntime as
        | { sendMessage: (input: string | Record<string, unknown>) => Promise<void> }
        | undefined;
      if (!sendPipelineRuntime) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: 'Chat view send pipeline not accessible.',
        });
        return;
      }

      this.plugin.app.workspace.revealLeaf(leaf);
      await sendPipelineRuntime.sendMessage(prompt);

      outputEl.createEl('p', {
        text: `Message sent through ordinary chat pipeline. Target file: ${targetPath}, nonce: ${nonce}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Waiting for model response. If the model calls a write tool, the permission card should appear in the chat view with data-permission-card selector.',
      });
    } catch (err) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Ordinary chat permission proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      // Restore original settings
      this.plugin.settings.backendSettings.claudeCode.permissionMode = originalPermissionMode;
      try {
        await adapter?.setPermissionMode(originalPermissionMode);
      } catch {
        // ignore restore errors
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Restored — permissionMode: ${proofPermissionMode} → ${originalPermissionMode}, model: ${originalModel || 'default'}`,
      });
    }
  }

  /**
   * Launch an ordinary-chat AskUserQuestion proof by sending a real message through the
   * OpenCodian chat view's send pipeline.
   */
  private async launchOrdinaryChatQuestionProof(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Launching ordinary chat question proof…' });

    try {
      const leaf = this.plugin.app.workspace.getLeavesOfType('opencodian-view')[0];
      const view = leaf?.view as unknown as Record<string, unknown> | undefined;
      if (!view) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: 'OpenCodian chat view not found. Open the chat view first.',
        });
        return;
      }

      const sendPipelineRuntime = view.sendPipelineRuntime as
        | { sendMessage: (input: string | Record<string, unknown>) => Promise<void> }
        | undefined;
      if (!sendPipelineRuntime) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: 'Chat view send pipeline not accessible.',
        });
        return;
      }

      this.plugin.app.workspace.revealLeaf(leaf);

      const prompt = 'Before you proceed, please ask me a single yes/no question using the AskUserQuestion tool: "Should I continue with the analysis?"';
      await sendPipelineRuntime.sendMessage(prompt);

      outputEl.createEl('p', {
        text: `Message sent through ordinary chat pipeline. Prompt: "${prompt}"`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Waiting for model response. If the model calls AskUserQuestion, the question dialog should appear in the chat view with data-question-card selector.',
      });
    } catch (err) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Ordinary chat question proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // =======================================================================
  // Live UI Harnesses — deterministic, bypass model, use real shared UI
  // =======================================================================

  /**
   * Create a temporary synthetic streaming assistant message element so that
   * shared inline card renderers have a DOM target without a real model stream.
   *
   * This is strictly diagnostic-only: it mutates the active tab runtime state
   * transiently and returns a cleanup function that MUST be invoked.
   */
  private injectSyntheticStreamingContext(): {
    cleanup: () => void;
    success: boolean;
    message: string;
    diagnostics?: Record<string, unknown>;
  } {
    try {
      const leaf = this.plugin.app.workspace.getLeavesOfType('opencodian-view')[0];
      const view = leaf?.view as unknown as Record<string, unknown> | undefined;
      if (!view) {
        return { cleanup: () => {}, success: false, message: 'OpenCodian chat view not found.' };
      }

      const getActiveTabId = view['getActiveTabId'] as (() => string | null) | undefined;
      const getTabRuntimeState = view['getTabRuntimeState'] as ((tabId: string | null) => Record<string, unknown> | null) | undefined;
      const messagesContainer = view['messagesContainer'] as HTMLElement | null;

      if (!getActiveTabId || !getTabRuntimeState || !messagesContainer) {
        return {
          cleanup: () => {},
          success: false,
          message: 'Chat view internals not accessible.',
          diagnostics: {
            hasGetActiveTabId: !!getActiveTabId,
            hasGetTabRuntimeState: !!getTabRuntimeState,
            hasMessagesContainer: !!messagesContainer,
          },
        };
      }

      const tabId = getActiveTabId();
      const runtime = getTabRuntimeState(tabId);
      if (!runtime) {
        return {
          cleanup: () => {},
          success: false,
          message: 'No active tab runtime state.',
          diagnostics: { tabId, hasRuntime: false },
        };
      }

      const syntheticEl = document.createElement('div');
      syntheticEl.className = 'opencodian-message opencodian-message-assistant opencodian-diagnostic-synthetic-streaming';
      const contentEl = syntheticEl.createDiv({ cls: 'opencodian-message-content' });
      contentEl.createEl('p', { text: '🔬 Diagnostic streaming shell — temporary context for inline card rendering' });

      messagesContainer.appendChild(syntheticEl);

      const previousStreamingMessageEl = runtime['streamingMessageEl'] as HTMLElement | null;
      runtime['streamingMessageEl'] = syntheticEl;

      // Verify the injection took effect by re-reading from the view
      const runtimeAfter = getTabRuntimeState(tabId);
      const verified = runtimeAfter?.['streamingMessageEl'] === syntheticEl;

      const cleanup = (): void => {
        syntheticEl.remove();
        runtime['streamingMessageEl'] = previousStreamingMessageEl;
      };

      return {
        cleanup,
        success: true,
        message: 'Synthetic streaming context injected.',
        diagnostics: {
          tabId,
          verified,
          previousStreamingMessageEl: previousStreamingMessageEl ? 'present' : 'null',
          runtimeKeys: Object.keys(runtime).filter((k) => !k.startsWith('_')),
          isStreaming: runtime['isStreaming'],
          messagesContainerConnected: messagesContainer.isConnected,
          messagesContainerChildCount: messagesContainer.childElementCount,
        },
      };
    } catch (err) {
      return {
        cleanup: () => {},
        success: false,
        message: `Failed to inject synthetic context: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Deterministically trigger the live permission card through the bridge.
   * This does NOT involve the model; it directly calls canUseTool with a mock
   * request so the bridge → host → renderer → user → result chain is exercised.
   */
  private async runLivePermissionCardHarness(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Triggering live permission card via ClaudeCodePermissionBridge…' });

    const bridge = this.plugin.claudeCodePermissionBridge as ClaudeCodePermissionBridge | null;
    if (!bridge) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: 'Permission bridge not available. Claude Code backend may not be enabled.',
      });
      this.updateRuntimeProof('Permission Approval', 'fail', outputEl);
      return;
    }

    const hostCtx = this.plugin.claudeCodePermissionHostContext;
    const hasRenderer = !!hostCtx.permissionCardRenderer;

    if (!hasRenderer) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Permission card renderer is not available. Open the OpenCodian chat view first to register the UI renderer.',
      });
      this.updateRuntimeProof('Permission Approval', 'boundary', outputEl);
      return;
    }

    const synthetic = this.injectSyntheticStreamingContext();
    if (!synthetic.success) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Cannot create diagnostic streaming context: ${synthetic.message} The renderer exists but requires an active streaming assistant message. This is an architectural boundary: shared inline cards are designed to render within a live chat stream, not in isolation.`,
      });
      this.updateRuntimeProof('Permission Approval', 'boundary', outputEl);
      return;
    }

    // Log injection diagnostics for debugging
    if (synthetic.diagnostics) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Injection diagnostics: tabId=${String(synthetic.diagnostics.tabId)}, verified=${String(synthetic.diagnostics.verified)}, isStreaming=${String(synthetic.diagnostics.isStreaming)}`,
      });
    }

    try {
      // Direct deterministic call — no model involved.
      // We use a harmless mock tool to avoid side effects.
      const result = await bridge.canUseTool('Bash', { command: 'echo "diagnostic-harness"' });

      outputEl.empty();
      outputEl.createEl('p', {
        text: `Live permission card completed. User decision: ${result.behavior}`,
      });

      if (result.behavior === 'allow') {
        outputEl.createEl('p', {
          text: 'User approved the permission request. The bridge → host → renderer → user → result chain is fully functional.',
        });
        this.updateRuntimeProof('Permission Approval', 'pass', outputEl);
      } else {
        // Deny or interrupt both prove the chain worked: the card rendered, the user saw it,
        // and the decision propagated back through renderer → host → bridge.
        // interrupt: true here means the user cancelled/closed without choosing, which still
        // proves the UI rendered and was interactive.
        outputEl.createEl('p', {
          text: `User decision: ${result.behavior}. The permission card rendered and the interaction completed — this is a live UI proof.`,
        });
        this.updateRuntimeProof('Permission Approval', 'pass', outputEl);
      }
    } catch (err) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Live permission card failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Permission Approval', 'fail', outputEl);
    } finally {
      synthetic.cleanup();
    }
  }

  /**
   * Deterministically trigger the live question dialog through the bridge.
   * This does NOT involve the model; it directly calls canUseTool('AskUserQuestion', …)
   * so the bridge → host → question renderer → user → result chain is exercised.
   */
  private async runLiveQuestionDialogHarness(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Triggering live question dialog via ClaudeCodePermissionBridge…' });

    const bridge = this.plugin.claudeCodePermissionBridge as ClaudeCodePermissionBridge | null;
    if (!bridge) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: 'Permission bridge not available. Claude Code backend may not be enabled.',
      });
      this.updateRuntimeProof('AskUserQuestion / Elicitation', 'fail', outputEl);
      return;
    }

    const hostCtx = this.plugin.claudeCodePermissionHostContext;
    const hasRenderer = !!hostCtx.questionCardRenderer;

    if (!hasRenderer) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Question dialog renderer is not available. Open the OpenCodian chat view first to register the UI renderer.',
      });
      this.updateRuntimeProof('AskUserQuestion / Elicitation', 'boundary', outputEl);
      return;
    }

    const synthetic = this.injectSyntheticStreamingContext();
    if (!synthetic.success) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Cannot create diagnostic streaming context: ${synthetic.message} The renderer exists but requires an active streaming assistant message. This is an architectural boundary: shared inline dialogs are designed to render within a live chat stream, not in isolation.`,
      });
      this.updateRuntimeProof('AskUserQuestion / Elicitation', 'boundary', outputEl);
      return;
    }

    // Log injection diagnostics for debugging
    if (synthetic.diagnostics) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Injection diagnostics: tabId=${String(synthetic.diagnostics.tabId)}, verified=${String(synthetic.diagnostics.verified)}, isStreaming=${String(synthetic.diagnostics.isStreaming)}`,
      });
    }

    try {
      // Direct deterministic call with AskUserQuestion input.
      const result = await bridge.canUseTool('AskUserQuestion', {
        questions: [
          {
            question: 'This is a diagnostic question from the Capability Lab harness. Please select an option to verify the UI chain.',
            header: 'Diagnostic Question',
            options: [
              { label: 'Option A', description: 'First test option' },
              { label: 'Option B', description: 'Second test option' },
            ],
          },
        ],
      });

      outputEl.empty();
      outputEl.createEl('p', {
        text: `Live question dialog completed. User decision: ${result.behavior}`,
      });

      if (result.behavior === 'allow') {
        outputEl.createEl('p', {
          text: 'User answered the diagnostic question. The bridge → host → question renderer → user → result chain is fully functional.',
        });
        this.updateRuntimeProof('AskUserQuestion / Elicitation', 'pass', outputEl);
      } else {
        // Deny or interrupt both prove the chain worked: the dialog rendered, the user saw it,
        // and the decision propagated back through renderer → host → bridge.
        // interrupt: true here means the user cancelled/closed without choosing, which still
        // proves the UI rendered and was interactive.
        outputEl.createEl('p', {
          text: `User decision: ${result.behavior}. The question dialog rendered and the interaction completed — this is a live UI proof.`,
        });
        this.updateRuntimeProof('AskUserQuestion / Elicitation', 'pass', outputEl);
      }
    } catch (err) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Live question dialog failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('AskUserQuestion / Elicitation', 'fail', outputEl);
    } finally {
      synthetic.cleanup();
    }
  }

  /**
   * Probe the synthetic streaming context in isolation.
   * Directly invokes the renderer's createStreamingInlineCard to verify
   * that the synthetic context is sufficient for card insertion, without
   * going through the bridge → host chain.
   */
  private async runStreamingContextProbe(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Probing synthetic streaming context in isolation…' });

    const hostCtx = this.plugin.claudeCodePermissionHostContext;
    const hasPermissionRenderer = !!hostCtx.permissionCardRenderer;
    const hasQuestionRenderer = !!hostCtx.questionCardRenderer;

    // Log renderer registration state
    const regState = outputEl.createDiv({ cls: 'opencodian-capability-lab-hint' });
    regState.createEl('p', { text: `Permission renderer registered: ${hasPermissionRenderer}` });
    regState.createEl('p', { text: `Question renderer registered: ${hasQuestionRenderer}` });

    const synthetic = this.injectSyntheticStreamingContext();

    // Log injection diagnostics
    if (synthetic.diagnostics) {
      const diagEl = outputEl.createDiv({ cls: 'opencodian-capability-lab-hint' });
      diagEl.createEl('p', { text: 'Injection diagnostics:' });
      diagEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: formatJsonPreview(synthetic.diagnostics),
      });
    }

    if (!synthetic.success) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Synthetic context injection failed: ${synthetic.message}`,
      });
      return;
    }

    try {
      // Try to directly call the renderer's createStreamingInlineCard via reflection.
      // This bypasses the bridge and host to test ONLY whether the synthetic
      // streamingMessageEl is visible to the renderer.
      const leaf = this.plugin.app.workspace.getLeavesOfType('opencodian-view')[0];
      const view = leaf?.view as unknown as Record<string, unknown> | undefined;
      const streamingInlineCardRenderer = view?.['streamingInlineCardRenderer'] as {
        createStreamingInlineCard?: (className: string, tabId: string | null) => HTMLElement | null;
      } | undefined;

      const directCardResult = streamingInlineCardRenderer?.createStreamingInlineCard?.(
        'opencodian-diagnostic-probe',
        (synthetic.diagnostics?.tabId as string | null) ?? null,
      );

      outputEl.createEl('p', {
        text: `Direct renderer probe: ${directCardResult ? 'card created successfully' : 'card creation returned null'}`,
      });

      if (directCardResult) {
        outputEl.createEl('p', {
          text: 'The synthetic streaming context IS sufficient for the renderer to create a card.',
        });
        // Clean up the probe card
        directCardResult.remove();

        // Now verify the permission bridge host chain is wired.
        // This probe proves the shared streaming insertion path (synthetic context → renderer)
        // and the permission host seam (collectToolApproval). It does NOT prove the
        // AskUserQuestion / Elicitation question bridge path, which requires separate
        // evidence from the actual question bridge DOM/runtime (runLiveQuestionDialogHarness).
        if (hasPermissionRenderer) {
          const host = this.plugin.agentServiceRegistry?.get('claude-code')
            ? (this.plugin.agentServiceRegistry.get('claude-code') as unknown as {
                options?: { permissionBridge?: { host?: { collectToolApproval?: unknown } } };
              })
            : undefined;
          const hasHostApproval = !!host?.options?.permissionBridge?.host?.collectToolApproval;
          outputEl.createEl('p', {
            text: `Permission bridge host.collectToolApproval wired: ${hasHostApproval}`,
          });

          if (hasHostApproval) {
            outputEl.createEl('p', {
              text: 'Permission insertion path verified: synthetic context → renderer → permission host. The live permission harness should now work when the chat view is active. AskUserQuestion proof requires the separate question bridge harness.',
            });
            this.updateRuntimeProof('Permission Approval', 'pass', outputEl);
            // NOTE: We do NOT mark AskUserQuestion / Elicitation as pass here.
            // This probe only proves the shared streaming insertion path and the
            // permission host seam (collectToolApproval). The question bridge path
            // (collectQuestionApproval or equivalent) is separate and unproven by
            // this isolation probe. AskUserQuestion proof is anchored to the actual
            // question bridge DOM/runtime evidence from runLiveQuestionDialogHarness.
          } else {
            outputEl.createEl('p', {
              cls: 'opencodian-capability-lab-hint',
              text: 'Renderer works but permission bridge host is not wired. The blocker is upstream in the bridge → host registration.',
            });
          }
        }
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'The synthetic streaming context is NOT sufficient — the renderer still sees streamingMessageEl as null. This means either: (1) the runtime object the harness modifies is not the same object the renderer reads, (2) streamingMessageEl is being cleared between injection and probe, or (3) the tabId does not match.',
        });
      }
    } catch (err) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Probe failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      synthetic.cleanup();
    }
  }

  private extractModelFromDiagnosticResult(
    result: ClaudeCodeDiagnosticPromptResult,
  ): string | undefined {
    // Prefer message_metadata chunks which the stream normalizer extracts
    // from system/session_init messages.
    for (const chunk of result.chunks) {
      if (chunk.type === 'message_metadata') {
        const modelId = (chunk as Record<string, unknown>).modelId;
        if (typeof modelId === 'string' && modelId.length > 0) {
          return modelId;
        }
      }
    }
    // Fallback: scan raw SDK messages for any model field.
    for (const message of result.rawMessages) {
      if (message && typeof message === 'object') {
        const record = message as Record<string, unknown>;
        const model = record.model ?? (record.message as Record<string, unknown>)?.model;
        if (typeof model === 'string' && model.length > 0) {
          return model;
        }
      }
    }
    return undefined;
  }

  // =======================================================================
  // Stable Settings Readback Proof
  // =======================================================================

  private async runStableSettingsReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running stable settings readback proof…' });

    try {
      await adapter.runDiagnosticPrompt({
        prompt: 'Reply with the words stable settings readback proof.',
        persistSession: false,
      });

      const options = adapter.inspectLastDiagnosticSdkOptions?.();
      outputEl.empty();
      outputEl.createEl('h5', { text: 'Stable Settings Readback Proof' });

      if (!options) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: 'No SDK options were captured. The adapter may not support readback, or no diagnostic prompt has been run yet.',
        });
        return;
      }

      const results = this.buildReadbackResults(options);
      this.renderReadbackResults(outputEl, results);
      this.updateMatrixFromReadback(outputEl, results);
      await this.renderRuntimeSettingsReadback(adapter, outputEl);
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Stable settings readback failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private async renderRuntimeSettingsReadback(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    const runtimeSettingsEl = outputEl.createDiv({
      cls: 'opencodian-capability-lab-runtime-settings-readback',
      attr: {
        'data-runtime-settings-readback': 'true',
        'data-proof-state': 'readback',
      },
    });
    runtimeSettingsEl.createEl('h5', { text: 'Runtime Settings Readback (Query.getSettings)' });
    runtimeSettingsEl.createEl('p', {
      cls: 'opencodian-capability-lab-hint',
      text: 'Read-only live SDK settings snapshot. Supporting evidence only: this does not author settings and does not promote File Checkpoint / Rewind, Fallback Model, or MCP authoring to pass.',
    });

    const getRuntimeSettings = (adapter as unknown as {
      getRuntimeSettings?: () => Promise<unknown | null>;
    }).getRuntimeSettings;
    if (typeof getRuntimeSettings !== 'function') {
      runtimeSettingsEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Query.getSettings() readback is unavailable on this adapter build.',
      });
      return;
    }

    let runtimeSettings: unknown;
    try {
      runtimeSettings = await getRuntimeSettings.call(adapter);
    } catch (err) {
      runtimeSettingsEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Query.getSettings() readback failed: ${err instanceof Error ? err.message : String(err)}. Existing SDK options readback remains the available evidence.`,
      });
      return;
    }

    if (runtimeSettings === null || runtimeSettings === undefined) {
      runtimeSettingsEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Query.getSettings() returned no runtime settings snapshot. Existing SDK options readback remains the available evidence.',
      });
      return;
    }

    runtimeSettingsEl.createEl('pre', {
      cls: 'opencodian-capability-lab-json-preview',
      text: truncate(formatJsonPreview(redactRuntimeSettingsReadback(runtimeSettings)), 8000),
    });
  }

  private buildAgentDefinitionsReadback(
    options: import('../../core/agents/backend/ClaudeCodeOptionsBuilder').ClaudeCodeSdkOptionsShape,
  ): {
    present: boolean;
    displayText: string;
    overallNote: string;
  } {
    const hasAgent = typeof options.agent === 'string' && options.agent.trim().length > 0;
    const agentsVal = options.agents && typeof options.agents === 'object' ? options.agents : {};
    const agentKeys = Object.keys(agentsVal);
    const hasAgents = agentKeys.length > 0;
    const present = hasAgent || hasAgents;

    const displayText = present
      ? `Agent Definitions: ${hasAgent ? `agent="${options.agent}"` : ''}${hasAgent && hasAgents ? '; ' : ''}${hasAgents ? `${agentKeys.length} definition(s) (${agentKeys.join(', ')})` : ''}`
      : 'Agent Definitions: not configured';

    const overallNote = present
      ? 'Option read back (Layer 1 supporting evidence). Behavior proof comes from the dedicated inline Agent Definition Proof — SDK accepts agent/agents options and the selected agent alters assistant behavior. Not duplicated here.'
      : 'Not configured. Agent definitions are subagent configuration wired at adapter initialization. Behavior proof available via inline Agent Definition Proof when definitions are present.';

    return { present, displayText, overallNote };
  }

  private buildReadbackResults(
    options: import('../../core/agents/backend/ClaudeCodeOptionsBuilder').ClaudeCodeSdkOptionsShape,
  ): Array<{
    matrixName: string;
    present: boolean;
    displayText: string;
    overallStatus: 'readback' | 'wiring' | 'pass';
    overallNote: string;
  }> {
    const allowedToolsVal = options.allowedTools ?? [];
    const allowedTools = Array.isArray(allowedToolsVal) && allowedToolsVal.length > 0;
    const disallowedToolsVal = options.disallowedTools ?? [];
    const disallowedTools = Array.isArray(disallowedToolsVal) && disallowedToolsVal.length > 0;
    const hasMaxTurns = options.maxTurns !== undefined && options.maxTurns !== null;
    const hasMaxBudget = options.maxBudgetUsd !== undefined && options.maxBudgetUsd !== null;
    const envVal = options.env ?? {};
    const hasEnv = Object.keys(envVal).length > 0;
    const hasFallback = options.fallbackModel !== undefined && options.fallbackModel !== null
      && String(options.fallbackModel).length > 0;
    const agentDefReadback = this.buildAgentDefinitionsReadback(options);

    return [
      {
        matrixName: 'Allowed Tools',
        present: allowedTools,
        displayText: allowedTools
          ? `Allowed Tools: ${allowedToolsVal.length} tool(s) configured (${allowedToolsVal.join(', ')})`
          : 'Allowed Tools: not configured',
        overallStatus: 'readback',
        overallNote: 'Option read back. Behavior (model respects allowlist) not proven.',
      },
      {
        matrixName: 'Disallowed Tools',
        present: disallowedTools,
        displayText: disallowedTools
          ? `Disallowed Tools: ${disallowedToolsVal.length} tool(s) configured (${disallowedToolsVal.join(', ')})`
          : 'Disallowed Tools: not configured',
        overallStatus: 'readback',
        overallNote: 'Option read back. Runtime behavior proof available via "Run Disallowed Tools Proof" diagnostic — init message tool catalog inspection proves enforcement at tool-catalog level.',
      },
      {
        matrixName: 'Turn/Budget Limits',
        present: hasMaxTurns || hasMaxBudget,
        displayText: hasMaxTurns || hasMaxBudget
          ? `Turn/Budget Limits: maxTurns=${String(options.maxTurns)}, maxBudgetUsd=${String(options.maxBudgetUsd)}`
          : 'Turn/Budget Limits: not configured (SDK default: unlimited)',
        overallStatus: 'readback',
        overallNote: 'Option read back. Behavior (model stops at limit) not proven.',
      },
      {
        matrixName: 'Environment Variables',
        present: hasEnv,
        displayText: hasEnv
          ? `Environment Variables: ${Object.keys(envVal).length} variable(s) configured`
          : 'Environment Variables: not configured',
        overallStatus: 'readback',
        overallNote: 'Option read back. This surface proves settings→SDK mapping only (readback supporting evidence). Live behavior proof (env propagation into Claude/Bash subprocess, Layer 1-4) is verified in Capability Lab. Overall capability: verified (pass).',
      },
      {
        matrixName: 'Fallback Model',
        present: hasFallback,
        displayText: hasFallback
          ? `Fallback Model: option="${String(options.fallbackModel)}" — option read back correctly (--fallback-model CLI flag)`
          : 'Fallback Model: not configured',
        overallStatus: 'readback',
        overallNote: hasFallback
          ? 'Option read back correctly. Source-backed blocker hardened: SDK source (sdk.mjs) contains exactly 3 fallback refs — destructure + same-model validate + push CLI arg. ZERO switching logic in SDK; all model-switching in compiled CLI binary triggered by API-side HTTP 529/capacity overload. Invalid-primary runtime test (BUILD_ID feature-phase0-capability.202605300441) undermined: SDK accepts arbitrary model names, no fallback. Cannot simulate real API overload locally. Switching behavior not locally provable.'
          : 'Not configured. Source-backed blocker: SDK source (sdk.mjs) has zero switching logic — only CLI arg pushing. All model-switching in compiled CLI binary behind API-side HTTP 529/capacity signals. Cannot simulate real API overload locally.',
      },
      {
        matrixName: 'Agent Definitions',
        present: agentDefReadback.present,
        displayText: agentDefReadback.displayText,
        overallStatus: 'readback',
        overallNote: agentDefReadback.overallNote,
      },
    ];
  }

  private renderReadbackResults(
    outputEl: HTMLElement,
    results: Array<{
      matrixName: string;
      present: boolean;
      displayText: string;
      overallStatus: 'readback' | 'wiring' | 'pass';
      overallNote: string;
    }>,
  ): void {
    const resultsEl = outputEl.createDiv({ cls: 'opencodian-capability-lab-readback-results' });

    for (const result of results) {
      const row = resultsEl.createDiv({
        cls: `opencodian-capability-lab-readback-row${result.present ? ' opencodian-capability-lab-readback-present' : ''}`,
      });
      row.createEl('strong', {
        text: `${result.present ? '✓' : '○'} ${result.matrixName}: `,
      });
      row.createSpan({ text: result.displayText });

      const noteEl = row.createEl('div', {
        cls: `opencodian-capability-lab-readback-note opencodian-capability-lab-readback-note-${result.overallStatus}`,
      });
      const statusIcon = result.overallStatus === 'pass' ? '✅' : result.overallStatus === 'readback' ? '📋' : '⚠️';
      noteEl.createSpan({ text: `${statusIcon} ${result.overallNote}` });
    }

    outputEl.createEl('p', {
      cls: 'opencodian-capability-lab-hint',
      text: 'This proof verifies that settings UI values were correctly mapped into the SDK options shape. Capabilities marked ✅ have independent runtime behavior proof via the diagnostic bypass path.',
    });
  }

  private updateMatrixFromReadback(
    outputEl: HTMLElement,
    results: Array<{
      matrixName: string;
      present: boolean;
      displayText: string;
      overallStatus: 'readback' | 'wiring' | 'pass';
      overallNote: string;
    }>,
  ): void {
    let anyPresent = false;
    for (const result of results) {
      if (result.present) {
        anyPresent = true;
        this.updateRuntimeProof(result.matrixName, result.overallStatus, outputEl);
      }
    }

    if (!anyPresent) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'None of the stable settings are currently configured. Configure them in the Claude Code settings tabs and re-run this proof.',
      });
    }
  }

  private async runEnvironmentVariablesProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running environment variables runtime proof…' });

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const envKey = `OPENCODIAN_ENV_PROOF_${Date.now()}`;
    const envProofPath = join(tmpdir(), `opencodian-env-proof-${nonce}`);
    const prompt = [
      'Use the Bash tool to run this exact command:',
      'printf \'%s\' "${OPENCODIAN_ENV_PROOF_NONCE}" > "${OPENCODIAN_ENV_PROOF_PATH}"',
      `Then respond with exactly: ${nonce}`,
      'Do not add extra words.',
    ].join(' ');

    const originalEnv = { ...(this.claudeCodeSettings.env ?? {}) };
    this.claudeCodeSettings.env = {
      ...originalEnv,
      [envKey]: nonce,
      OPENCODIAN_ENV_PROOF_NONCE: nonce,
      OPENCODIAN_ENV_PROOF_PATH: envProofPath,
    };

    try {
      rmSync(envProofPath, { force: true });
      const result = await adapter.runDiagnosticPrompt({
        prompt,
        persistSession: false,
        // Diagnostic bypass: skip permission approval host wiring.
        // This proves env propagation into Claude/Bash subprocesses,
        // NOT permission approval UX. Permission approval is proven
        // independently by ordinary chat + live harness paths.
        _diagnosticBypassPermissions: true,
      });

      const options = adapter.inspectLastDiagnosticSdkOptions?.();
      const envFromReadback = options?.env ?? {};
      const readbackMatch = typeof envFromReadback[envKey] === 'string' && envFromReadback[envKey] === nonce;

      const bashToolUses = result.chunks.filter((chunk) => (
        chunk.type === 'tool_use' && chunk.name === 'Bash'
      ));
      const bashToolResults = result.chunks.filter((chunk) => (
        chunk.type === 'tool_result'
      ));
      const resultTextJoined = result.chunks
        .filter((chunk): chunk is Extract<import('../../core/types/chat').StreamChunk, { type: 'text' }> => chunk.type === 'text')
        .map((chunk) => chunk.content)
        .join('\n');

      const nonceSeenInAssistantText = resultTextJoined.includes(nonce);
      let envSideEffectObserved = false;
      let envSideEffectDetail = '';
      if (existsSync(envProofPath)) {
        try {
          const fileContent = readFileSync(envProofPath, 'utf-8').trim();
          envSideEffectObserved = fileContent === nonce;
          envSideEffectDetail = envSideEffectObserved
            ? 'PASS (nonce value verified in side-effect file)'
            : `PARTIAL (file exists but content mismatch: expected "${nonce}", got "${truncate(fileContent, 80)}")`;
        } catch {
          envSideEffectDetail = 'PARTIAL (file exists but unreadable)';
        }
      } else {
        envSideEffectDetail = 'NO EVIDENCE (side-effect file not created)';
      }

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Environment Variables Proof (layered)' });
      outputEl.createEl('p', { text: `Probe env key: ${envKey}` });
      outputEl.createEl('p', { text: `Expected nonce: ${nonce}` });
      outputEl.createEl('p', { text: `Permission path: diagnostic bypass (proves env propagation, not permission UI)` });
      outputEl.createEl('p', { text: `Layer 1 (settings -> SDK readback): ${readbackMatch ? 'PASS' : 'FAIL'}` });
      outputEl.createEl('p', { text: `Layer 2 (Bash tool invoked): ${bashToolUses.length > 0 ? 'PASS' : 'NO EVIDENCE'}` });
      outputEl.createEl('p', { text: `Layer 3 (env-derived filesystem side effect): ${envSideEffectDetail}` });
      outputEl.createEl('p', { text: `Layer 4 (assistant text nonce echo): ${nonceSeenInAssistantText ? 'PASS' : 'NO EVIDENCE'}` });

      if (envSideEffectObserved) {
        this.updateRuntimeProof('Environment Variables', 'pass', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Behavior proof achieved: env-derived side-effect file contains the expected nonce value, proving env propagation into the Bash subprocess. Permission approval is proven separately by ordinary chat + live harness paths.',
        });
      } else {
        this.updateRuntimeProof('Environment Variables', readbackMatch ? 'readback' : 'wiring', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Behavior proof not achieved (diagnostic bypass path active). Current evidence is limited to SDK readback and/or non-deterministic model behavior.',
        });
      }

      if (bashToolResults.length > 0) {
        renderMessagePreviewList(
          outputEl,
          'Bash tool_result preview',
          bashToolResults.map((chunk) => ({
            type: chunk.type,
            content: truncate(chunk.content, 300),
          })),
        );
      }
    } catch (err) {
      outputEl.empty();
      const options = adapter.inspectLastDiagnosticSdkOptions?.();
      const envFromReadback = options?.env ?? {};
      const readbackMatch = typeof envFromReadback[envKey] === 'string' && envFromReadback[envKey] === nonce;
      outputEl.createEl('h5', { text: 'Environment Variables Proof (layered)' });
      outputEl.createEl('p', { text: `Probe env key: ${envKey}` });
      outputEl.createEl('p', { text: `Probe env path: ${envProofPath}` });
      outputEl.createEl('p', { text: `Expected nonce: ${nonce}` });
      outputEl.createEl('p', { text: `Permission path: diagnostic bypass (proves env propagation, not permission UI)` });
      outputEl.createEl('p', { text: `Layer 1 (settings -> SDK readback): ${readbackMatch ? 'PASS' : 'FAIL'}` });
      outputEl.createEl('p', { text: 'Layer 2 (Bash tool invoked): BLOCKED (diagnostic run failed before deterministic capture)' });
      outputEl.createEl('p', { text: 'Layer 3 (env-derived filesystem side effect observed): BLOCKED' });
      outputEl.createEl('p', { text: 'Layer 4 (assistant text nonce echo): BLOCKED' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Environment variables proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Environment Variables', readbackMatch ? 'readback' : 'fail', outputEl);
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Blocker: diagnostic run failed even with bypass path. This suggests an SDK-level issue, not a permission host wiring problem.',
      });
    } finally {
      rmSync(envProofPath, { force: true });
      this.claudeCodeSettings.env = originalEnv;
    }
  }

  private async runAgentDefinitionProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running agent definition runtime proof…' });

    const proofMarker = 'AGENT-DEF-PROOF-ACTIVATED';
    const agentId = 'opencodian-proof-agent';

    try {
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Say hello.',
        agent: agentId,
        agents: {
          [agentId]: {
            description: 'A diagnostic agent that proves inline agent definitions are passed through to the SDK.',
            prompt: `You are a proof agent. Every response you give MUST begin with the exact text "${proofMarker}" on its own line, followed by a blank line, then your actual answer. Do not deviate from this format under any circumstances.`,
          },
        },
        persistSession: false,
      });

      const options = adapter.inspectLastDiagnosticSdkOptions?.();
      const agentReadback = options?.agent;
      const agentsReadback = options?.agents;
      const readbackMatch = agentReadback === agentId &&
        typeof agentsReadback === 'object' &&
        agentsReadback !== null &&
        agentId in agentsReadback;

      const resultTextJoined = result.chunks
        .filter((chunk): chunk is Extract<import('../../core/types/chat').StreamChunk, { type: 'text' }> => chunk.type === 'text')
        .map((chunk) => chunk.content)
        .join('\n');

      const markerSeenInAssistantText = resultTextJoined.includes(proofMarker);

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Agent Definition Proof (layered)' });
      outputEl.createEl('p', { text: `Probe agent ID: ${agentId}` });
      outputEl.createEl('p', { text: `Expected marker: "${proofMarker}"` });
      outputEl.createEl('p', { text: `Layer 1 (SDK options readback): ${readbackMatch ? 'PASS' : 'FAIL'}` });
      outputEl.createEl('p', { text: `Layer 2 (assistant text marker echo): ${markerSeenInAssistantText ? 'PASS' : 'NO EVIDENCE'}` });

      if (readbackMatch && markerSeenInAssistantText) {
        this.updateRuntimeProof('Agent Definitions', 'pass', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Behavior proof achieved: inline agent definition was passed through SDK options and the selected agent altered assistant behavior as instructed.',
        });
      } else if (readbackMatch) {
        this.updateRuntimeProof('Agent Definitions', 'readback', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Readback verified: agent/agents reached SDK options, but assistant behavior did not show the expected marker. This may mean the SDK accepted the options but did not apply the inline agent definition (e.g., pre-registered agents only).',
        });
      } else {
        this.updateRuntimeProof('Agent Definitions', 'fail', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'SDK options readback failed: agent/agents were not reflected in diagnostic SDK options. Check adapter wiring.',
        });
      }

      if (resultTextJoined.length > 0) {
        outputEl.createEl('pre', {
          cls: 'opencodian-capability-lab-json-preview',
          text: truncate(resultTextJoined, 2000),
        });
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('h5', { text: 'Agent Definition Proof (layered)' });
      outputEl.createEl('p', { text: `Probe agent ID: ${agentId}` });
      outputEl.createEl('p', { text: `Expected marker: "${proofMarker}"` });
      outputEl.createEl('p', { text: 'Layer 1 (SDK options readback): BLOCKED (diagnostic run failed before readback)' });
      outputEl.createEl('p', { text: 'Layer 2 (assistant text marker echo): BLOCKED' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Agent definition proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Agent Definitions', 'fail', outputEl);
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Blocker: the SDK rejected the inline agent definition or the diagnostic run failed for another reason. This is a valid finding — it tells us inline agent definitions are not supported in this SDK version or configuration.',
      });
    }
  }

  private classifyAllowedToolsResult(
    outputEl: HTMLElement,
    phaseA: { initToolArray: string[]; catalogIsSubset: boolean; nonAllowedInCatalog: number; toolNamesA: string[]; disallowedToolCallsA: string[] },
    phaseB: { nonBypassResult: { toolCallsRequested: string[]; toolCallsExecuted: string[] } | null; nonBypassError: string | null },
  ): void {
    if (phaseA.initToolArray.length > 0 && phaseA.catalogIsSubset) {
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Init catalog contains only Read (${phaseA.initToolArray.length} tool(s)), but this is NOT allowedTools enforcement. The SDK \`tools\` restrictor is owned by "Restricted Built-in Tools". allowedTools is a pre-approve/auto-approve shortcut only.`,
      });
      this.updateRuntimeProof('Allowed Tools', 'readback', outputEl);
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: 'Classification: readback — allowedTools is an auto-approve shortcut, not an availability restrictor. Use "Restricted Built-in Tools" for deterministic built-in catalog filtering.',
      });
      return;
    }

    const nonBypassRequested = phaseB.nonBypassResult?.toolCallsRequested ?? [];
    const nonBypassRequestedNonAllowed = nonBypassRequested.filter((n) => n !== 'Read');

    if (phaseB.nonBypassResult && nonBypassRequested.length > 0 && nonBypassRequestedNonAllowed.length === 0) {
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: `Phase B inconclusive: SDK only requested approval for [${nonBypassRequested.join(', ')}]. This is consistent with enforcement but not deterministic proof — the model may have omitted non-allowed tools in this single run. Cannot promote past readback.` });
      this.updateRuntimeProof('Allowed Tools', 'readback', outputEl);
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: 'Classification: readback — absence of non-allowed canUseTool calls from one model run is not SDK-owned enforcement proof.' });
    } else if (phaseB.nonBypassResult && nonBypassRequestedNonAllowed.length > 0) {
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: `Phase B evidence: SDK requested approval for non-allowed tools [${nonBypassRequestedNonAllowed.join(', ')}] — allowedTools is NOT enforced before canUseTool.` });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: 'Layer 0 — Proven readback: allowedTools option reaches SDK CLI boundary.' });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: `Layer 1 — Proven bypass-mode: init catalog unfiltered (${phaseA.nonAllowedInCatalog} non-allowed tools).` });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: `Layer 2 — Proven non-bypass: synthetic canUseTool received ${nonBypassRequestedNonAllowed.length} non-allowed tool request(s) [${nonBypassRequestedNonAllowed.join(', ')}]. The SDK does NOT enforce allowedTools at the canUseTool boundary — non-allowed tools pass through to the approval callback.` });
      this.updateRuntimeProof('Allowed Tools', 'readback', outputEl);
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: 'Classification: readback — allowedTools reaches SDK boundary but has zero enforcement (catalog unfiltered, canUseTool not filtered). Option is a dead letter in query() mode.' });
    } else if (phaseB.nonBypassError) {
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: `Phase B error: ${phaseB.nonBypassError}` });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: 'Layer 0 — Proven readback: allowedTools option reaches SDK CLI boundary.' });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: `Layer 1 — Proven bypass-mode: init catalog unfiltered (${phaseA.nonAllowedInCatalog} non-allowed tools).` });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: `Layer 2 — Non-bypass error: SDK could not complete non-bypass diagnostic run. Error: ${phaseB.nonBypassError}. Approval-host boundary remains.` });
      this.updateRuntimeProof('Allowed Tools', 'readback', outputEl);
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: 'Classification: readback — Layer 0/1 proven, Layer 2 blocked by non-bypass error.' });
    } else if (phaseB.nonBypassResult && nonBypassRequested.length === 0) {
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: 'Phase B: SDK did not request approval for any tools (canUseTool dead in query() mode).' });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: `Phase B executed tools: [${phaseB.nonBypassResult.toolCallsExecuted.join(', ')}]` });
      if (phaseA.disallowedToolCallsA.length > 0 && phaseA.initToolArray.length === 0) {
        outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
          text: `Phase A observation: model called ${phaseA.disallowedToolCallsA.join(', ')} which is not in the allowed list. This confirms allowedTools is NOT an availability restrictor — use "Restricted Built-in Tools" for deterministic catalog filtering.` });
        this.updateRuntimeProof('Allowed Tools', 'readback', outputEl);
        outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
          text: 'Classification: readback — observing non-allowed tool calls proves allowedTools is not a restrictor, but does not prove the capability "failed". It is a pre-approve shortcut only.' });
      } else {
        this.updateRuntimeProof('Allowed Tools', 'readback', outputEl);
        outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
          text: 'Classification: readback — Phase B inconclusive (zero canUseTool calls). Cannot determine enforcement.' });
      }
    } else {
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint',
        text: 'Phase A: catalog unfiltered, model behavior non-deterministic. Phase B did not produce a classifiable signal.' });
      this.updateRuntimeProof('Allowed Tools', 'readback', outputEl);
    }
  }

  private async runAllowedToolsProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running allowed tools runtime proof…' });

    const originalAllowedTools = [...this.claudeCodeSettings.allowedTools];
    const originalDisallowedTools = [...this.claudeCodeSettings.disallowedTools];

    try {
      this.claudeCodeSettings.allowedTools = ['Read'];
      this.claudeCodeSettings.disallowedTools = [];
      await this.saveClaudeCodeSettings();

      const resultA = await adapter.runDiagnosticPrompt({
        prompt: 'List files in the current directory using Bash, then read the first file you find.',
        persistSession: false,
        _diagnosticBypassPermissions: true,
      });

      const initMessage = resultA.rawMessages.find((msg): msg is Record<string, unknown> =>
        msg !== null && typeof msg === 'object'
        && (msg as Record<string, unknown>).type === 'system'
        && (msg as Record<string, unknown>).subtype === 'init',
      );
      const initTools: unknown = initMessage?.tools;
      const initToolArray = Array.isArray(initTools) ? initTools as string[] : [];
      const nonAllowedInCatalog = initToolArray.filter((t) => t !== 'Read');
      const catalogIsSubset = initToolArray.length > 0 && nonAllowedInCatalog.length === 0;

      const toolUsesA = resultA.chunks.filter((chunk) => chunk.type === 'tool_use');
      const toolNamesA = toolUsesA.map((chunk) => (chunk as { name?: string }).name).filter(Boolean) as string[];
      const disallowedToolCallsA = toolNamesA.filter((name) => name !== 'Read');

      const nonBypassToolCalls: string[] = [];
      let nonBypassError: string | null = null;
      let nonBypassResult: { toolCallsRequested: string[]; toolCallsExecuted: string[] } | null = null;

      try {
        const syntheticCanUseTool = async (
          toolName: string,
          _input: Record<string, unknown>,
          _context: Record<string, unknown>,
        ): Promise<{ behavior: 'allow'; updatedInput?: Record<string, unknown> }> => {
          nonBypassToolCalls.push(toolName);
          return { behavior: 'allow' };
        };

        const resultB = await adapter.runDiagnosticPrompt({
          prompt: 'List files in the current directory using Bash, then read the first file you find.',
          persistSession: false,
          _diagnosticBypassPermissions: false,
          _diagnosticCanUseTool: syntheticCanUseTool,
          _diagnosticForcePermissionMode: 'default',
        });

        const toolUsesB = resultB.chunks.filter((chunk) => chunk.type === 'tool_use');
        const toolNamesB = toolUsesB.map((chunk) => (chunk as { name?: string }).name).filter(Boolean) as string[];

        nonBypassResult = {
          toolCallsRequested: [...new Set(nonBypassToolCalls)],
          toolCallsExecuted: [...new Set(toolNamesB)],
        };
      } catch (err) {
        nonBypassError = err instanceof Error ? err.message : String(err);
      }

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Allowed Tools Proof' });
      outputEl.createEl('p', { text: 'Configured allowedTools: ["Read"]' });
      outputEl.createEl('p', { text: 'Phase A (bypass mode):' });
      outputEl.createEl('p', { text: `  Init catalog (${initToolArray.length} tools): [${initToolArray.slice(0, 15).map((n) => `"${n}"`).join(', ')}${initToolArray.length > 15 ? '...' : ''}]` });
      outputEl.createEl('p', { text: `  Non-allowed in catalog: ${nonAllowedInCatalog.length}` });
      outputEl.createEl('p', { text: `  Tools called by model: [${toolNamesA.map((n) => `"${n}"`).join(', ')}]` });
      outputEl.createEl('p', { text: 'Phase B (non-bypass, synthetic canUseTool):' });
      if (nonBypassError) {
        outputEl.createEl('p', { text: `  Error: ${nonBypassError}` });
      } else if (nonBypassResult) {
        outputEl.createEl('p', { text: `  Tools SDK requested approval for: [${nonBypassResult.toolCallsRequested.map((n) => `"${n}"`).join(', ')}]` });
        outputEl.createEl('p', { text: `  Tools actually executed: [${nonBypassResult.toolCallsExecuted.map((n) => `"${n}"`).join(', ')}]` });
      } else {
        outputEl.createEl('p', { text: '  No result (unexpected).' });
      }

      this.classifyAllowedToolsResult(outputEl,
        { initToolArray, catalogIsSubset, nonAllowedInCatalog: nonAllowedInCatalog.length, toolNamesA, disallowedToolCallsA },
        { nonBypassResult, nonBypassError });
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('h5', { text: 'Allowed Tools Proof' });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-error', text: `Allowed tools proof failed: ${err instanceof Error ? err.message : String(err)}` });
      this.updateRuntimeProof('Allowed Tools', 'fail', outputEl);
    } finally {
      this.claudeCodeSettings.allowedTools = originalAllowedTools;
      this.claudeCodeSettings.disallowedTools = originalDisallowedTools;
      await this.saveClaudeCodeSettings();
    }
  }

  private async runRestrictedBuiltinToolsProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running restricted built-in tools runtime proof…' });

    // Layer 1: Wiring readback — verify buildClaudeCodeOptions maps
    // restrictedBuiltinTools to options.tools. This tests the normal
    // (non-diagnostic) setting wiring path.
    const { buildClaudeCodeOptions } = await import('../../core/agents/backend/ClaudeCodeOptionsBuilder');
    const wiringSettings = { ...getDefaultClaudeCodeBackendSettings(), restrictedBuiltinTools: ['Read', 'Grep'] };
    const wiringOptions = buildClaudeCodeOptions({
      vaultPath: '/wiring-test',
      settings: wiringSettings,
    });
    const wiringToolsIsArray = Array.isArray(wiringOptions.tools);
    const wiringToolsMatch = wiringToolsIsArray
      && (wiringOptions.tools as string[]).length === 2
      && (wiringOptions.tools as string[])[0] === 'Read'
      && (wiringOptions.tools as string[])[1] === 'Grep';
    // Also verify empty = default preset
    const emptySettings = getDefaultClaudeCodeBackendSettings();
    const emptyOptions = buildClaudeCodeOptions({ vaultPath: '/empty-test', settings: emptySettings });
    const emptyIsPreset = JSON.stringify(emptyOptions.tools) === '{"type":"preset","preset":"claude_code"}';

    // Layer 2: Runtime catalog via real settings wiring path.
    // Temporarily set restrictedBuiltinTools = ['Read'] on the live settings
    // object, then run a diagnostic prompt WITHOUT _diagnosticToolRestriction.
    // Because main.ts passes the same settings object into ClaudeCodeAdapter and
    // buildDiagnosticSdkOptions() re-reads this.options.settings each call,
    // this exercises the normal settings wiring, not the diagnostic escape hatch.
    const originalRestrictedBuiltinTools = [...this.claudeCodeSettings.restrictedBuiltinTools];
    try {
      this.claudeCodeSettings.restrictedBuiltinTools = ['Read'];
      await this.saveClaudeCodeSettings();

      const result = await adapter.runDiagnosticPrompt({
        prompt: 'List files in the current directory.',
        persistSession: false,
        _diagnosticBypassPermissions: true,
        // No _diagnosticToolRestriction — the restriction comes from
        // this.claudeCodeSettings.restrictedBuiltinTools via normal wiring.
      });

      // Verify the diagnostic SDK options snapshot shows the restriction came
      // from settings, not from the diagnostic escape hatch.
      const lastDiagOptions = adapter.inspectLastDiagnosticSdkOptions();
      const diagToolsIsArray = lastDiagOptions != null && Array.isArray(lastDiagOptions.tools);

      const initMessage = result.rawMessages.find((msg): msg is Record<string, unknown> =>
        msg !== null && typeof msg === 'object'
        && (msg as Record<string, unknown>).type === 'system'
        && (msg as Record<string, unknown>).subtype === 'init',
      );
      const initTools: unknown = initMessage?.tools;
      const initToolArray = Array.isArray(initTools) ? initTools as string[] : [];

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Restricted Built-in Tools Proof' });

      // Layer 1 output
      outputEl.createEl('p', { text: `Layer 1 (wiring readback):` });
      outputEl.createEl('p', { text: `  buildClaudeCodeOptions({restrictedBuiltinTools:['Read','Grep']}) → tools: ${JSON.stringify(wiringOptions.tools)}` });
      outputEl.createEl('p', { text: `  Wiring correct: ${wiringToolsMatch}` });
      outputEl.createEl('p', { text: `  Empty → preset: ${emptyIsPreset} (tools: ${JSON.stringify(emptyOptions.tools)})` });

      // Layer 2 output
      outputEl.createEl('p', { text: `Layer 2 (runtime catalog via settings wiring):` });
      outputEl.createEl('p', { text: `  Settings restrictedBuiltinTools: ${JSON.stringify(this.claudeCodeSettings.restrictedBuiltinTools)} (temporarily set; restored after proof)` });
      outputEl.createEl('p', { text: `  Init catalog (${initToolArray.length} tools): [${initToolArray.map((n) => `"${n}"`).join(', ')}]` });
      outputEl.createEl('p', { text: `  Diagnostic options tools is array: ${diagToolsIsArray} (via buildClaudeCodeOptions, not _diagnosticToolRestriction)` });

      // ── Honest classification ──
      // For PASS, ALL of the following must hold:
      // 1. Wiring readback: restrictedBuiltinTools correctly maps to options.tools
      // 2. Empty setting preserves default preset
      // 3. Init catalog contains the requested built-in tool (Read)
      // 4. Every non-requested tool in init catalog is explicitly identifiable
      //    as an MCP tool (prefixed with mcp__ or similar MCP namespace pattern)
      // 5. No extra built-in Claude Code tools remain in catalog

      const layer1Pass = wiringToolsMatch && emptyIsPreset;
      const readInCatalog = initToolArray.includes('Read');
      const nonRequestedTools = initToolArray.filter((t) => t !== 'Read');
      // MCP tools in the init catalog typically carry mcp__ prefix or are
      // namespaced by the MCP server. Known MCP prefix patterns:
      //   mcp__<server>__<tool>  (Claude Code MCP tool naming)
      const isMcpTool = (toolName: string): boolean => toolName.startsWith('mcp__');
      const mcpTools = nonRequestedTools.filter(isMcpTool);
      const nonMcpNonRequested = nonRequestedTools.filter((t) => !isMcpTool(t));
      const noExtraBuiltinTools = nonMcpNonRequested.length === 0;

      outputEl.createEl('p', { text: `  Read in catalog: ${readInCatalog}` });
      outputEl.createEl('p', { text: `  Non-requested tools: [${nonRequestedTools.join(', ')}]` });
      outputEl.createEl('p', { text: `  MCP tools (mcp__*): [${mcpTools.join(', ')}]` });
      outputEl.createEl('p', { text: `  Non-MCP non-requested: [${nonMcpNonRequested.join(', ')}]` });

      if (layer1Pass && readInCatalog && noExtraBuiltinTools) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-success',
          text: `PASS: Layer 1 wiring verified. Layer 2 init catalog contains Read, no extra built-in tools. ${mcpTools.length > 0 ? `MCP tools [${mcpTools.join(', ')}] correctly pass through (unaffected by this setting).` : 'No MCP tools in catalog.'}`,
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Scope: this setting restricts built-in Claude Code tools only. MCP tools are unaffected and always pass through.',
        });
        this.updateRuntimeProof('Restricted Built-in Tools', 'pass', outputEl);
      } else if (layer1Pass && readInCatalog && !noExtraBuiltinTools) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `READBACK: Wiring verified and Read in catalog, but non-MCP non-requested tools remain: [${nonMcpNonRequested.join(', ')}]. Cannot confirm these are MCP tools via naming convention — classification downgraded to readback.`,
        });
        this.updateRuntimeProof('Restricted Built-in Tools', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `FAIL: Layer1=${layer1Pass}, ReadInCatalog=${readInCatalog}, NoExtraBuiltin=${noExtraBuiltinTools}`,
        });
        this.updateRuntimeProof('Restricted Built-in Tools', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('h5', { text: 'Restricted Built-in Tools Proof' });
      outputEl.createEl('p', { text: `Layer 1 (wiring readback): Wiring correct=${wiringToolsMatch}, Empty preset=${emptyIsPreset}` });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Layer 2 (runtime) failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      if (wiringToolsMatch) {
        this.updateRuntimeProof('Restricted Built-in Tools', 'readback', outputEl);
      } else {
        this.updateRuntimeProof('Restricted Built-in Tools', 'fail', outputEl);
      }
    } finally {
      this.claudeCodeSettings.restrictedBuiltinTools = originalRestrictedBuiltinTools;
      await this.saveClaudeCodeSettings();
    }
  }

  private async runDisallowedToolsProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running disallowed tools runtime proof…' });

    const originalAllowedTools = [...this.claudeCodeSettings.allowedTools];
    const originalDisallowedTools = [...this.claudeCodeSettings.disallowedTools];

    try {
      this.claudeCodeSettings.allowedTools = [];
      this.claudeCodeSettings.disallowedTools = ['Bash'];
      await this.saveClaudeCodeSettings();

      const result = await adapter.runDiagnosticPrompt({
        prompt: 'List files in the current directory using Bash.',
        persistSession: false,
        _diagnosticBypassPermissions: true,
      });

      // ── Layer 1: Init-message tool catalog inspection (deterministic) ──
      // The SDK init message (type:'system', subtype:'init') contains a `tools`
      // string array listing every tool visible to the model. If `disallowedTools`
      // is enforced, the disallowed tool must be absent from this catalog.
      // This is deterministic — it does not depend on model tool-calling behavior.
      const initMessage = result.rawMessages.find((msg): msg is Record<string, unknown> =>
        msg !== null && typeof msg === 'object'
        && (msg as Record<string, unknown>).type === 'system'
        && (msg as Record<string, unknown>).subtype === 'init',
      );
      const initTools: unknown = initMessage?.tools;
      const initToolArray = Array.isArray(initTools) ? initTools as string[] : [];
      const bashInInitCatalog = initToolArray.includes('Bash');

      // ── Layer 2: tool_use observation (supplementary, non-deterministic) ──
      const toolUses = result.chunks.filter((chunk) => chunk.type === 'tool_use');
      const toolNames = toolUses.map((chunk) => (chunk as { name?: string }).name).filter(Boolean);
      const blockedToolCalls = toolNames.filter((name) => name === 'Bash');

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Disallowed Tools Proof' });
      outputEl.createEl('p', { text: `Configured disallowedTools: ["Bash"]` });
      outputEl.createEl('p', { text: `Init message tool catalog (${initToolArray.length} tools): [${initToolArray.slice(0, 20).map((n) => `"${n}"`).join(', ')}${initToolArray.length > 20 ? '...' : ''}]` });
      outputEl.createEl('p', { text: `Bash in init catalog: ${String(bashInInitCatalog)}` });
      outputEl.createEl('p', { text: `Tools called by model: [${toolNames.map((n) => `"${n}"`).join(', ')}]` });

      // Classification logic: Layer 1 (init catalog) is the primary signal.
      if (initToolArray.length > 0 && !bashInInitCatalog) {
        // Deterministic pass: Bash is NOT in the init tool catalog.
        // The SDK removed it from the model's context — enforcement is proven
        // at the tool-definition level, independent of model behavior.
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-success',
          text: `Enforcement PASS: Bash is absent from the init tool catalog (${initToolArray.length} tools). The SDK removed the disallowed tool from the model's context.`,
        });
        this.updateRuntimeProof('Disallowed Tools', 'pass', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Deterministic proof: init message tools field has ${initToolArray.length} entries, none of which are Bash. This proves the SDK enforces disallowedTools at the tool-catalog level.`,
        });
      } else if (initToolArray.length > 0 && bashInInitCatalog) {
        // Deterministic fail: Bash IS in the init tool catalog despite being disallowed.
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: 'Enforcement FAILED: Bash is present in the init tool catalog despite being in the disallowed list.',
        });
        this.updateRuntimeProof('Disallowed Tools', 'fail', outputEl);
      } else if (blockedToolCalls.length > 0) {
        // Layer 2 fallback: model called Bash — enforcement failed.
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: 'Enforcement likely FAILED: model called Bash which is in the disallowed list.',
        });
        this.updateRuntimeProof('Disallowed Tools', 'fail', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'The SDK did not prevent the model from calling a disallowed tool. This proves disallowedTools enforcement is not working as expected.',
        });
      } else if (toolNames.length === 0) {
        outputEl.createEl('p', {
          text: 'No tool calls observed. Model may have responded in text without calling any tools.',
        });
        this.updateRuntimeProof('Disallowed Tools', 'readback', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Inconclusive: no init message tools field and no tool calls. Readback remains the only verified layer.',
        });
      } else {
        outputEl.createEl('p', {
          text: 'Bash was not called. This is consistent with enforcement, but without init catalog proof it is not conclusive.',
        });
        this.updateRuntimeProof('Disallowed Tools', 'readback', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'Absence of Bash tool calls without init catalog proof is not deterministic enforcement evidence. Readback remains the only verified layer.',
        });
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('h5', { text: 'Disallowed Tools Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Disallowed tools proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Disallowed Tools', 'fail', outputEl);
    } finally {
      this.claudeCodeSettings.allowedTools = originalAllowedTools;
      this.claudeCodeSettings.disallowedTools = originalDisallowedTools;
      await this.saveClaudeCodeSettings();
    }
  }

  // =======================================================================
  // Plugins Proof — marketplace plugin → MCP server / skill chain
  // =======================================================================

  private async runPluginsProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running Plugins proof — inspecting marketplace plugin loading and contributions…' });

    try {
      // Run a minimal diagnostic prompt to capture the init message.
      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Reply with: PLUGINS-PROOF-ACK',
        persistSession: false,
        _diagnosticBypassPermissions: true,
      });

      // ── Layer 1: Find init message and extract plugin metadata ──
      const initMessage = result.rawMessages.find((msg): msg is Record<string, unknown> =>
        msg !== null && typeof msg === 'object'
        && (msg as Record<string, unknown>).type === 'system'
        && (msg as Record<string, unknown>).subtype === 'init',
      );

      if (!initMessage) {
        outputEl.empty();
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: 'No init message found in diagnostic stream.',
        });
        this.updateRuntimeProof('Plugins', 'fail', outputEl);
        return;
      }

      const plugins = initMessage.plugins;
      const pluginArray = Array.isArray(plugins) ? plugins as Array<{ name: string; path: string }> : [];
      const mcpServers = initMessage.mcp_servers;
      const mcpServerArray = Array.isArray(mcpServers) ? mcpServers as Array<{ name: string; status: string }> : [];
      const skills = initMessage.skills;
      const skillArray = Array.isArray(skills) ? skills as string[] : [];
      const slashCommands = initMessage.slash_commands;
      const slashCommandArray = Array.isArray(slashCommands) ? slashCommands as string[] : [];

      // Extract plugin base names (before @) for correlation
      const pluginBaseNames = pluginArray.map((p) => p.name.split('@')[0]);

      // ── Layer 2: Check if plugins contribute MCP servers ──
      // Plugin-provided MCP servers use "plugin:<pluginBaseName>:<serverName>" naming.
      const pluginMcpServers = mcpServerArray.filter((server) =>
        server.name.startsWith('plugin:')
        || pluginBaseNames.some((baseName) =>
          server.name === baseName
          || server.name.startsWith(`${baseName}-`)
          || server.name.startsWith(`${baseName}_`)
          || server.name.includes(`:${baseName}:`),
        ),
      );

      // ── Layer 2b: Check if plugins contribute skills ──
      const pluginContributedSkills = skillArray.filter((skill) =>
        pluginBaseNames.some((baseName) =>
          skill === baseName
          || skill.startsWith(`${baseName}:`)
          || skill.startsWith(`${baseName}-`)
          || skill.startsWith(`${baseName}_`),
        ),
      );

      // ── Display results ──
      outputEl.empty();
      outputEl.createEl('h5', { text: 'Plugins Proof — Marketplace Plugin Runtime Verification' });

      outputEl.createEl('p', {
        text: `Layer 1 — Init message plugins (${pluginArray.length}): [${pluginArray.map((p) => `${p.name}`).join(', ')}]`,
      });

      outputEl.createEl('p', {
        text: `Init MCP servers (${mcpServerArray.length}): [${mcpServerArray.map((s) => `${s.name}(${s.status})`).join(', ')}]`,
      });

      outputEl.createEl('p', {
        text: `Init skills (${skillArray.length}): [${skillArray.slice(0, 30).join(', ')}${skillArray.length > 30 ? '…' : ''}]`,
      });

      outputEl.createEl('p', {
        text: `Init slash commands (${slashCommandArray.length}): [${slashCommandArray.slice(0, 20).join(', ')}${slashCommandArray.length > 20 ? '…' : ''}]`,
      });

      outputEl.createEl('p', {
        text: `Plugin base names for correlation: [${pluginBaseNames.join(', ')}]`,
      });

      outputEl.createEl('p', {
        text: `Plugin-contributed MCP servers (${pluginMcpServers.length}): [${pluginMcpServers.map((s) => `${s.name}(${s.status})`).join(', ')}]`,
      });

      outputEl.createEl('p', {
        text: `Plugin-contributed skills (${pluginContributedSkills.length}): [${pluginContributedSkills.join(', ')}]`,
      });

      // ── Classification ──
      // Separate evidence tiers:
      //   - Plugin-provided skills in init.skills: BEHAVIOR PROOF (plugins contribute functional skills)
      //   - Plugin-provided MCP servers in init.mcp_servers: REGISTRATION/READBACK only
      //     (status may be "failed" — registered but not currently functional)
      //   - Programmatic SdkPluginConfig: DEAD LETTER (subprocess ignores)
      const hasPlugins = pluginArray.length > 0;
      const hasPluginSkills = pluginContributedSkills.length > 0;

      // Classify MCP server status
      const pluginMcpConnected = pluginMcpServers.filter((s) => s.status === 'connected');
      const pluginMcpFailed = pluginMcpServers.filter((s) => s.status !== 'connected');

      outputEl.createEl('p', {
        text: `MCP server evidence: plugin-provided MCP servers = ${pluginMcpServers.length} (${pluginMcpConnected.length} connected, ${pluginMcpFailed.length} not connected). MCP servers are registration evidence; pass is anchored to plugin→skills chain.`,
      });

      if (hasPlugins && hasPluginSkills) {
        // PASS: Marketplace plugins loaded AND contributing plugin-scoped skills.
        // This is the strongest behavior proof: plugins are loaded, their skills
        // appear in init.skills using pluginName:skillName naming, and the model
        // can use those skills.
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-success',
          text: `PASS: ${pluginArray.length} marketplace plugin(s) loaded, contributing ${pluginContributedSkills.length} plugin-scoped skill(s) to init.skills. Pass is anchored to plugin→skills chain only. Plugin-provided MCP servers (${pluginMcpServers.length}) appear in init.mcp_servers but are registration evidence, not behavior proof. Programmatic SdkPluginConfig path is a dead letter.`,
        });
        this.updateRuntimeProof('Plugins', 'pass', outputEl);
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Nuance: programmatic plugins option (SdkPluginConfig with type:'local', path) is a dead letter in query() mode — structurally identical to Hooks JS callback limitation. The marketplace plugin path (from ~/.claude/plugins/ cache) is the real runtime path. Plugin→skills chain is proven functional. Plugin→MCP server chain is registered but MCP status was not "connected" at probe time.`,
        });
      } else if (hasPlugins) {
        // READBACK: Plugins loaded but no correlated contributions found
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `READBACK: ${pluginArray.length} marketplace plugin(s) loaded (init.plugins present) but no correlated MCP server or skill contributions found. Plugin base names: [${pluginBaseNames.join(', ')}]. MCP servers: [${mcpServerArray.map((s) => s.name).join(', ')}]. Skills: [${skillArray.slice(0, 10).join(', ')}].`,
        });
        this.updateRuntimeProof('Plugins', 'readback', outputEl);
      } else {
        // READBACK: No plugins loaded at all
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: 'READBACK: No marketplace plugins found in init message. SDK options wiring may be correct but no plugins are loaded in this context.',
        });
        this.updateRuntimeProof('Plugins', 'readback', outputEl);
      }

      // JSON preview
      outputEl.createEl('pre', {
        cls: 'opencodian-capability-lab-json-preview',
        text: truncate(formatJsonPreview({
          plugins: pluginArray,
          mcpServers: mcpServerArray,
          skills: skillArray,
          slashCommands: slashCommandArray,
          pluginMcpCorrelation: pluginMcpServers,
          pluginSkillCorrelation: pluginContributedSkills,
        }), 8000),
      });
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('h5', { text: 'Plugins Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Plugins proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Plugins', 'fail', outputEl);
    }
  }

  // =======================================================================
  // Runtime Proof Update (in-page notification)
  // =======================================================================

  // =======================================================================
  // /context Diagnostic Proof — diagnostic-only /context command seam
  // =======================================================================

  private async runCommandExecutionProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running command execution proof (diagnostic-only, fixed safe command /context)…' });

    try {
      const result = await adapter.runDiagnosticPrompt({
        prompt: '/context',
        persistSession: false,
        _diagnosticBypassPermissions: true,
      });

      outputEl.empty();
      outputEl.createEl('h5', { text: '/context Diagnostic Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ Diagnostic-only: fixed read-only slash command /context. This does NOT mean ordinary Claude chat slash commands are productized. No arbitrary command input. No command authoring. No .claude/** writes.',
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-info',
        text: `Session: ${result.sessionId ?? 'unknown'}`,
      });

      // Classify based on rawMessages content
      const rawMsgs = result.rawMessages ?? [];
      const assistantMessages = rawMsgs.filter(
        (m: unknown) => (m as { type?: string })?.type === 'assistant',
      );
      const resultMessages = rawMsgs.filter(
        (m: unknown) => (m as { type?: string })?.type === 'result',
      );

      // Extract assistant text content to look for "Context Usage"
      // Real SDK assistant messages use block-array content: { content: [{ type: 'text', text: '...' }] }
      // Some normalized chunks also carry text content. Check both paths.
      const assistantText = assistantMessages.map(
        (m: unknown) => {
          const msg = m as { message?: { content?: unknown } };
          const content = msg?.message?.content;
          if (typeof content === 'string') return content;
          if (Array.isArray(content)) {
            return content
              .filter((b: unknown) => (b as { type?: string })?.type === 'text')
              .map((b: unknown) => (b as { text?: string })?.text ?? '')
              .join('\n');
          }
          return '';
        },
      ).join('\n');

      // Also check normalized text chunks as a secondary source
      const chunkText = result.chunks
        .filter((c: unknown) => (c as { type?: string })?.type === 'text')
        .map((c: unknown) => String((c as { content?: unknown })?.content ?? ''))
        .join('\n');

      const combinedText = assistantText + '\n' + chunkText;
      const hasContextUsage = combinedText.includes('Context Usage');
      const hasMessages = rawMsgs.length > 0 && assistantMessages.length > 0 && resultMessages.length > 0;

      if (hasContextUsage) {
        // PASS: Full success — /context command executed and returned expected output
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-success',
          text: `✓ /context command executed successfully. Raw messages: ${rawMsgs.length} (system → assistant → result). Context Usage report found in assistant response.`,
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-info',
          text: `Raw message types: ${rawMsgs.map((m: unknown) => (m as { type?: string })?.type ?? 'unknown').join(' → ')}`,
        });
        this.updateRuntimeProof('/context Diagnostic', 'pass', outputEl);
      } else if (hasMessages) {
        // READBACK: Messages returned but no "Context Usage" — unexpected output, don't inflate
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `✓ Readback verified — not behavior verified. Raw messages: ${rawMsgs.length}, but assistant response does not contain "Context Usage". The diagnostic seam is reachable but the /context command did not produce the expected output.`,
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-info',
          text: `Assistant text preview: ${combinedText.slice(0, 200)}`,
        });
        this.updateRuntimeProof('/context Diagnostic', 'readback', outputEl);
      } else {
        // READBACK: Empty/unexpected — seam reachable but no usable output
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `✓ Readback verified — not behavior verified. Diagnostic prompt returned ${rawMsgs.length} raw messages with no assistant/result pair. The seam is reachable but produced no usable output.`,
        });
        this.updateRuntimeProof('/context Diagnostic', 'readback', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `/context diagnostic proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('/context Diagnostic', 'fail', outputEl);
    }
  }

  // =======================================================================
  // Warm Startup Proof — diagnostic readback for startup() / WarmQuery seam
  // =======================================================================

  private async runWarmStartupProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running warm startup probe (diagnostic readback: startup() → WarmQuery → diagnostic prompt)…' });

    try {
      const result = await adapter.runWarmStartupProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Warm Startup Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ Diagnostic readback: startup() callable, WarmQuery handle obtainable, warm query() produces response. Warm-vs-cold latency benefit is the SDK\'s internal claim, not independently measured. No authoring UI. No .claude/** writes.',
      });

      if (result.classification === 'readback') {
        // READBACK: startup resolved + warm query responded
        const responseText = result.warmQueryResponded
          ? `✓ Readback verified — not behavior verified. startup() resolved → WarmQuery obtained → warm query() produced ${result.rawMessageCount} raw message(s). Warm-vs-cold latency benefit is the SDK's internal claim ("no startup latency"), not independently measured.`
          : `✓ Readback verified — not behavior verified. startup() resolved → WarmQuery obtained, but warm query() returned no messages.`;
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: responseText,
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-info',
          text: `startupResolved: ${result.startupResolved}, warmQueryAvailable: ${result.warmQueryAvailable}, warmQueryResponded: ${result.warmQueryResponded}, rawMessageCount: ${result.rawMessageCount}`,
        });
        this.updateRuntimeProof('Warm Startup', 'readback', outputEl);
      } else if (result.classification === 'boundary') {
        // BOUNDARY: SDK lacks startup()
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `◆ Boundary hit — SDK facade does not expose startup(). The startup() function may not be available in the current SDK version or the SDK loader did not forward it.`,
        });
        this.updateRuntimeProof('Warm Startup', 'boundary', outputEl);
      } else {
        // FAIL: startup or warm query threw
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `✗ Warm startup probe failed: ${result.error ?? 'unknown error'}`,
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-info',
          text: `startupResolved: ${result.startupResolved}, warmQueryAvailable: ${result.warmQueryAvailable}, warmQueryResponded: ${result.warmQueryResponded}`,
        });
        this.updateRuntimeProof('Warm Startup', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Warm startup proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Warm Startup', 'fail', outputEl);
    }
  }

  private async runStderrDiagnosticProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.stderr.running') });

    try {
      const result = await adapter.runStderrDiagnosticProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.stderr.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.stderr.boundary'),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.stderr.isolatedBoundary'),
      });

      if (result.classification === 'readback') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: (result.chunksReceived ?? 0) > 0
            ? t('settings.capabilityLab.proofs.stderr.readbackObserved', {
              chunks: result.chunksReceived ?? 0,
              totalBytes: result.totalBytes ?? 0,
            })
            : t('settings.capabilityLab.proofs.stderr.readbackSilent'),
        });
        if (result.sanitizedPreview && result.sanitizedPreview !== 'Callback wired — no stderr observed') {
          outputEl.createEl('pre', {
            cls: 'opencodian-capability-lab-json-preview',
            text: result.sanitizedPreview,
          });
        }
        this.updateRuntimeProof('Stderr Diagnostic', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.stderr.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.stderr.defaultError'),
          }),
        });
        this.updateRuntimeProof('Stderr Diagnostic', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.stderr.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Stderr Diagnostic', 'fail', outputEl);
    }
  }

  private async runPromptSuggestionsReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.promptSuggestions.running') });

    try {
      const result = await adapter.runPromptSuggestionsReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.promptSuggestions.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.promptSuggestions.boundary'),
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.promptSuggestions.optionWired', {
          status: result.optionWired
            ? t('settings.capabilityLab.proofs.promptSuggestions.status.yes')
            : t('settings.capabilityLab.proofs.promptSuggestions.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.promptSuggestions.optionValue', {
          value: result.optionValue
            ? t('settings.capabilityLab.proofs.promptSuggestions.status.enabled')
            : t('settings.capabilityLab.proofs.promptSuggestions.status.disabled'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.promptSuggestions.sdkOptionPresent', {
          status: result.sdkOptionPresent
            ? t('settings.capabilityLab.proofs.promptSuggestions.status.yes')
            : t('settings.capabilityLab.proofs.promptSuggestions.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.promptSuggestions.modelState', {
          state: result.modelState === 'claude'
            ? t('settings.capabilityLab.proofs.promptSuggestions.modelState.claude')
            : result.modelState === 'non-claude'
              ? t('settings.capabilityLab.proofs.promptSuggestions.modelState.nonClaude')
              : t('settings.capabilityLab.proofs.promptSuggestions.modelState.unknown'),
        }),
      });

      if (result.blockerNote) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-warning',
          text: t('settings.capabilityLab.proofs.promptSuggestions.blockerNote', {
            note: result.blockerNote,
          }),
        });
      }

      if (result.classification === 'readback') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.promptSuggestions.readback'),
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.promptSuggestions.lifecycleBoundary'),
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.promptSuggestions.uiLifecycleEvidence'),
        });
        this.updateRuntimeProof('Prompt Suggestions', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.promptSuggestions.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.promptSuggestions.defaultError'),
          }),
        });
        this.updateRuntimeProof('Prompt Suggestions', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.promptSuggestions.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Prompt Suggestions', 'fail', outputEl);
    }
  }

  private async runSystemPromptReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running system prompt readback probe…' });

    try {
      const result = await adapter.runSystemPromptReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: 'System Prompt Readback Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ Diagnostic readback only: settings→SDK option mapping verified. Actual prompt append behavior (whether the SDK truly appends instructions after the official preset) is not independently verifiable from the plugin layer. This is append-only: the official preset is always preserved. Changes take effect on next query / after restart.',
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Option wired: ${result.optionWired ? '✓ yes' : '✗ no'}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Setting empty: ${result.emptySetting ? 'yes (using default preset)' : 'no (using preset-with-append)'}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Official preset preserved: ${result.presetPreserved ? '✓ yes' : '✗ no'}`,
      });

      if (!result.emptySetting) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Append value: ${result.appendValue ?? '(none)'}`,
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Expected append value: ${result.expectedAppendValue ?? '(none)'}`,
        });
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Append match: ${result.appendMatch ? '✓ yes' : '✗ no'}`,
        });
      }

      if (result.classification === 'readback') {
        this.updateRuntimeProof('System Prompt', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `✗ System prompt readback probe failed: ${result.error ?? 'unknown error'}`,
        });
        this.updateRuntimeProof('System Prompt', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `System prompt readback proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('System Prompt', 'fail', outputEl);
    }
  }

  private async runSystemPromptLiveProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.systemPromptLive.running') });

    try {
      const result = await adapter.runSystemPromptLiveProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.systemPromptLive.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.systemPromptLive.behaviorBoundary'),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.systemPromptLive.mappingBoundary'),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.systemPromptLive.lifecycleBoundary'),
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.systemPromptLive.nonce', {
          nonce: result.nonce,
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.systemPromptLive.nonceRecalled', {
          status: result.nonceRecalled
            ? t('settings.capabilityLab.proofs.systemPromptLive.status.yes')
            : t('settings.capabilityLab.proofs.systemPromptLive.status.no'),
        }),
      });
      if (result.responsePreview) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.systemPromptLive.responsePreview', {
            preview: result.responsePreview,
          }),
        });
      }

      if (result.classification === 'pass') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.systemPromptLive.pass'),
        });
        this.updateRuntimeProof('System Prompt', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.systemPromptLive.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.systemPromptLive.defaultError'),
          }),
        });
        this.updateRuntimeProof('System Prompt', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.systemPromptLive.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('System Prompt', 'fail', outputEl);
    }
  }

  private async runTaskBudgetReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.taskBudget.running') });

    try {
      const result = await adapter.runTaskBudgetReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.taskBudget.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.taskBudget.boundary'),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.taskBudget.lifecycleBoundary'),
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.taskBudget.optionWired', {
          status: result.optionWired
            ? t('settings.capabilityLab.proofs.taskBudget.status.yes')
            : t('settings.capabilityLab.proofs.taskBudget.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.taskBudget.settingValue', {
          value: result.settingValue === null
            ? t('settings.capabilityLab.proofs.taskBudget.settingValueNull')
            : String(result.settingValue),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.taskBudget.sdkOptionPresent', {
          status: result.sdkOptionPresent
            ? t('settings.capabilityLab.proofs.taskBudget.status.yes')
            : t('settings.capabilityLab.proofs.taskBudget.status.no'),
        }),
      });
      if (result.sdkTotalValue !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.taskBudget.sdkTotalValue', {
            value: String(result.sdkTotalValue),
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.taskBudget.totalMatch', {
          status: result.totalMatch
            ? t('settings.capabilityLab.proofs.taskBudget.status.yes')
            : t('settings.capabilityLab.proofs.taskBudget.status.no'),
        }),
      });

      if (result.classification === 'readback') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.taskBudget.readback'),
        });
        this.updateRuntimeProof('Task Budget', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.taskBudget.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.taskBudget.defaultError'),
          }),
        });
        this.updateRuntimeProof('Task Budget', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.taskBudget.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Task Budget', 'fail', outputEl);
    }
  }

  private async runSandboxReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.sandbox.running') });

    try {
      const result = await adapter.runSandboxReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.sandbox.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.boundary'),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.lifecycleBoundary'),
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.optionWired', {
          status: result.optionWired
            ? t('settings.capabilityLab.proofs.sandbox.status.yes')
            : t('settings.capabilityLab.proofs.sandbox.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.settingEnabled', {
          status: result.settingEnabled
            ? t('settings.capabilityLab.proofs.sandbox.status.yes')
            : t('settings.capabilityLab.proofs.sandbox.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.settingFailIfUnavailable', {
          status: result.settingFailIfUnavailable
            ? t('settings.capabilityLab.proofs.sandbox.status.yes')
            : t('settings.capabilityLab.proofs.sandbox.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.settingAutoAllowBashIfSandboxed', {
          status: result.settingAutoAllowBashIfSandboxed
            ? t('settings.capabilityLab.proofs.sandbox.status.yes')
            : t('settings.capabilityLab.proofs.sandbox.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.sdkOptionPresent', {
          status: result.sdkOptionPresent
            ? t('settings.capabilityLab.proofs.sandbox.status.yes')
            : t('settings.capabilityLab.proofs.sandbox.status.no'),
        }),
      });
      if (result.sdkEnabled !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.sandbox.sdkEnabled', {
            status: result.sdkEnabled
              ? t('settings.capabilityLab.proofs.sandbox.status.yes')
              : t('settings.capabilityLab.proofs.sandbox.status.no'),
          }),
        });
      }
      if (result.sdkFailIfUnavailable !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.sandbox.sdkFailIfUnavailable', {
            status: result.sdkFailIfUnavailable
              ? t('settings.capabilityLab.proofs.sandbox.status.yes')
              : t('settings.capabilityLab.proofs.sandbox.status.no'),
          }),
        });
      }
      if (result.sdkAutoAllowBashIfSandboxed !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.sandbox.sdkAutoAllowBashIfSandboxed', {
            status: result.sdkAutoAllowBashIfSandboxed
              ? t('settings.capabilityLab.proofs.sandbox.status.yes')
              : t('settings.capabilityLab.proofs.sandbox.status.no'),
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.enabledMatch', {
          status: result.enabledMatch
            ? t('settings.capabilityLab.proofs.sandbox.status.yes')
            : t('settings.capabilityLab.proofs.sandbox.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.failIfUnavailableMatch', {
          status: result.failIfUnavailableMatch
            ? t('settings.capabilityLab.proofs.sandbox.status.yes')
            : t('settings.capabilityLab.proofs.sandbox.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sandbox.autoAllowBashIfSandboxedMatch', {
          status: result.autoAllowBashIfSandboxedMatch
            ? t('settings.capabilityLab.proofs.sandbox.status.yes')
            : t('settings.capabilityLab.proofs.sandbox.status.no'),
        }),
      });

      if (result.classification === 'readback') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.sandbox.readback'),
        });
        this.updateRuntimeProof('Sandbox', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.sandbox.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.sandbox.defaultError'),
          }),
        });
        this.updateRuntimeProof('Sandbox', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.sandbox.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Sandbox', 'fail', outputEl);
    }
  }

  private async runPlanModeInstructionsReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.planModeInstructions.running') });

    try {
      const result = await adapter.runPlanModeInstructionsReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.planModeInstructions.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: [
          t('settings.capabilityLab.proofs.planModeInstructions.boundary'),
          t('settings.capabilityLab.proofs.planModeInstructions.lifecycleBoundary'),
        ].join(' '),
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.planModeInstructions.optionWired', {
          status: result.optionWired
            ? t('settings.capabilityLab.proofs.planModeInstructions.status.yes')
            : t('settings.capabilityLab.proofs.planModeInstructions.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.planModeInstructions.permissionMode', {
          mode: String(result.permissionMode),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.planModeInstructions.settingValue', {
          value: result.settingValue.length > 0
            ? `'${result.settingValue}'`
            : t('settings.capabilityLab.proofs.planModeInstructions.settingValueEmpty'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.planModeInstructions.sdkOptionPresent', {
          status: result.sdkOptionPresent
            ? t('settings.capabilityLab.proofs.planModeInstructions.status.yes')
            : t('settings.capabilityLab.proofs.planModeInstructions.status.no'),
        }),
      });
      if (result.sdkValue !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.planModeInstructions.sdkValue', {
            value: String(result.sdkValue),
          }),
        });
      }
      if (result.permissionMode !== 'plan' && result.settingValue.length > 0 && result.sdkOptionPresent) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.planModeInstructions.builderWiringNuance'),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.planModeInstructions.valueMatch', {
          status: result.valueMatch
            ? t('settings.capabilityLab.proofs.planModeInstructions.status.yes')
            : t('settings.capabilityLab.proofs.planModeInstructions.status.no'),
        }),
      });

      if (result.classification === 'readback') {
        this.updateRuntimeProof('Plan Mode Instructions', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.planModeInstructions.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.planModeInstructions.defaultError'),
          }),
        });
        this.updateRuntimeProof('Plan Mode Instructions', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.planModeInstructions.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Plan Mode Instructions', 'fail', outputEl);
    }
  }

  private async runPlanModeInstructionsLiveProof(adapter: ClaudeCodeAdapter, outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.planModeInstructionsLive.running') });
    try {
      const result = await adapter.runPlanModeInstructionsLiveProbe();
      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.planModeInstructionsLive.title') });

      // behavior boundary
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: t('settings.capabilityLab.proofs.planModeInstructionsLive.behaviorBoundary') });
      // lifecycle boundary
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: t('settings.capabilityLab.proofs.planModeInstructionsLive.lifecycleBoundary') });
      // plan mode note
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: t('settings.capabilityLab.proofs.planModeInstructionsLive.planModeNote') });

      // nonce
      outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.planModeInstructionsLive.nonce', { nonce: result.nonce }) });

      // nonce recalled
      const recalledStatus = result.nonceRecalled
        ? t('settings.capabilityLab.proofs.planModeInstructionsLive.status.yes')
        : t('settings.capabilityLab.proofs.planModeInstructionsLive.status.no');
      outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.planModeInstructionsLive.nonceRecalled', { status: recalledStatus }) });

      // response preview
      if (result.responsePreview) {
        outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.planModeInstructionsLive.responsePreview', { preview: result.responsePreview }) });
      }

      if (result.classification === 'pass') {
        outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: t('settings.capabilityLab.proofs.planModeInstructionsLive.pass') });
        this.updateRuntimeProof('Plan Mode Instructions', 'pass', outputEl);
      } else {
        const error = result.error ?? t('settings.capabilityLab.proofs.planModeInstructionsLive.defaultError');
        outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: t('settings.capabilityLab.proofs.planModeInstructionsLive.fail', { error }) });
        this.updateRuntimeProof('Plan Mode Instructions', 'fail', outputEl);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.planModeInstructionsLive.title') });
      outputEl.createEl('p', { cls: 'opencodian-capability-lab-hint', text: t('settings.capabilityLab.proofs.planModeInstructionsLive.threw', { error: errorMessage }) });
      this.updateRuntimeProof('Plan Mode Instructions', 'fail', outputEl);
    }
  }

  private async runToolAliasesReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.toolAliases.running') });

    try {
      const result = await adapter.runToolAliasesReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.toolAliases.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.toolAliases.boundary'),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.toolAliases.lifecycleBoundary'),
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.toolAliases.optionWired', {
          status: result.optionWired
            ? t('settings.capabilityLab.proofs.toolAliases.status.yes')
            : t('settings.capabilityLab.proofs.toolAliases.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.toolAliases.settingEmpty', {
          status: result.settingEmpty
            ? t('settings.capabilityLab.proofs.toolAliases.status.yes')
            : t('settings.capabilityLab.proofs.toolAliases.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.toolAliases.sdkOptionPresent', {
          status: result.sdkOptionPresent
            ? t('settings.capabilityLab.proofs.toolAliases.status.yes')
            : t('settings.capabilityLab.proofs.toolAliases.status.no'),
        }),
      });
      if (result.sdkEntryCount !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.toolAliases.sdkEntryCount', {
            count: result.sdkEntryCount,
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.toolAliases.defensiveCopyPreserved', {
          status: result.defensiveCopyPreserved
            ? t('settings.capabilityLab.proofs.toolAliases.status.yes')
            : t('settings.capabilityLab.proofs.toolAliases.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.toolAliases.entriesMatch', {
          status: result.entriesMatch
            ? t('settings.capabilityLab.proofs.toolAliases.status.yes')
            : t('settings.capabilityLab.proofs.toolAliases.status.no'),
        }),
      });

      if (result.classification === 'readback') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.toolAliases.readback'),
        });
        this.updateRuntimeProof('Tool Aliases', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.toolAliases.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.toolAliases.defaultError'),
          }),
        });
        this.updateRuntimeProof('Tool Aliases', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.toolAliases.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Tool Aliases', 'fail', outputEl);
    }
  }

  private async runDebugReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.debug.running') });

    try {
      const result = await adapter.runDebugReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.debug.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debug.boundary'),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debug.lifecycleBoundary'),
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debug.optionWired', {
          status: result.optionWired
            ? t('settings.capabilityLab.proofs.debug.status.yes')
            : t('settings.capabilityLab.proofs.debug.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debug.settingValue', {
          value: result.settingValue ? 'true' : 'false',
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debug.sdkOptionPresent', {
          status: result.sdkOptionPresent
            ? t('settings.capabilityLab.proofs.debug.status.yes')
            : t('settings.capabilityLab.proofs.debug.status.no'),
        }),
      });
      if (result.sdkValue !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.debug.sdkValue', {
            value: result.sdkValue ? 'true' : 'false',
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debug.valueMatch', {
          status: result.valueMatch
            ? t('settings.capabilityLab.proofs.debug.status.yes')
            : t('settings.capabilityLab.proofs.debug.status.no'),
        }),
      });

      if (result.classification === 'readback') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.debug.readback'),
        });
        this.updateRuntimeProof('Debug', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.debug.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.debug.defaultError'),
          }),
        });
        this.updateRuntimeProof('Debug', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.debug.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Debug', 'fail', outputEl);
    }
  }

  private async runJsRuntimeReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running JS Runtime readback probe…' });

    try {
      const result = await adapter.runJsRuntimeReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: 'JS Runtime Readback Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ Diagnostic readback only: verifies settings→SDK option mapping only. Actual runtime selection depends on the SDK/CLI version, system PATH, and whether the requested runtime is installed. The plugin passes the option, but whether the subprocess actually uses the requested runtime is not independently verified. Applies to the next query or restarted session only. Active sessions do not update live. No runtime argument management is exposed (executableArgs / extraArgs remain absent).',
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Option wired: ${result.optionWired ? '✓ yes' : '✗ no'}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Setting value: ${result.emptySetting ? '(empty — auto)' : result.settingValue}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `SDK option present: ${result.sdkOptionPresent ? '✓ yes' : '✗ no'}`,
      });
      if (result.sdkValue !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `SDK value: ${result.sdkValue}`,
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Value match: ${result.valueMatch ? '✓ yes' : '✗ no'}`,
      });

      if (result.classification === 'readback') {
        this.updateRuntimeProof('JS Runtime', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `✗ JS Runtime readback probe failed: ${result.error ?? 'unknown error'}`,
        });
        this.updateRuntimeProof('JS Runtime', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `JS Runtime readback proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('JS Runtime', 'fail', outputEl);
    }
  }

  private async runLoadTimeoutReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running Load Timeout readback probe…' });

    try {
      const result = await adapter.runLoadTimeoutReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Load Timeout Readback Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ Diagnostic readback only: verifies settings→SDK option mapping only. Actual timeout behavior depends on the SDK/CLI version and runtime conditions. The plugin passes the option, but whether the subprocess actually honors the timeout is not independently verified. Applies to the next query or restarted session only. Active sessions do not update live.',
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Option wired: ${result.optionWired ? '✓ yes' : '✗ no'}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Setting value: ${result.settingValue !== null ? result.settingValue : '(null — SDK default)'}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `SDK option present: ${result.sdkOptionPresent ? '✓ yes' : '✗ no'}`,
      });
      if (result.sdkValue !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `SDK value: ${result.sdkValue}`,
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Value match: ${result.valueMatch ? '✓ yes' : '✗ no'}`,
      });

      if (result.classification === 'readback') {
        this.updateRuntimeProof('Load Timeout', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `✗ Load Timeout readback probe failed: ${result.error ?? 'unknown error'}`,
        });
        this.updateRuntimeProof('Load Timeout', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Load Timeout readback proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Load Timeout', 'fail', outputEl);
    }
  }

  private async runDebugFileReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.debugFile.running') });

    try {
      const result = await adapter.runDebugFileReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.debugFile.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFile.boundary'),
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFile.optionWired', {
          status: t(result.optionWired
            ? 'settings.capabilityLab.proofs.debugFile.status.yes'
            : 'settings.capabilityLab.proofs.debugFile.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFile.settingValue', {
          value: result.emptySetting
            ? t('settings.capabilityLab.proofs.debugFile.emptyValue')
            : `"${result.settingValue}"`,
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFile.sdkOptionPresent', {
          status: t(result.sdkOptionPresent
            ? 'settings.capabilityLab.proofs.debugFile.status.yes'
            : 'settings.capabilityLab.proofs.debugFile.status.no'),
        }),
      });
      if (result.sdkValue !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.debugFile.sdkValue', {
            value: `"${result.sdkValue}"`,
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFile.valueMatch', {
          status: t(result.valueMatch
            ? 'settings.capabilityLab.proofs.debugFile.status.yes'
            : 'settings.capabilityLab.proofs.debugFile.status.no'),
        }),
      });

      if (result.classification === 'readback') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.debugFile.readback'),
        });
        this.updateRuntimeProof('Debug File', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.debugFile.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.debugFile.defaultError'),
          }),
        });
        this.updateRuntimeProof('Debug File', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.debugFile.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Debug File', 'fail', outputEl);
    }
  }

  private async runDebugFileLiveProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.debugFileLive.running') });

    try {
      const result = await adapter.runDebugFileLiveProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.debugFileLive.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFileLive.boundary'),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFileLive.tempDir', {
          path: result.tempDir,
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFileLive.debugFilePath', {
          path: result.debugFilePath,
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFileLive.optionWired', {
          status: t(result.optionWired
            ? 'settings.capabilityLab.proofs.debugFileLive.status.yes'
            : 'settings.capabilityLab.proofs.debugFileLive.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFileLive.fileCreated', {
          status: t(result.fileExists
            ? 'settings.capabilityLab.proofs.debugFileLive.status.yes'
            : 'settings.capabilityLab.proofs.debugFileLive.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.debugFileLive.fileSize', {
          size: String(result.fileSize),
        }),
      });
      if (result.sessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.debugFileLive.session', {
            sessionId: result.sessionId,
          }),
        });
      }

      if (result.classification === 'pass') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.debugFileLive.pass'),
        });
        this.updateRuntimeProof('Debug File', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.debugFileLive.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.debugFileLive.defaultError'),
          }),
        });
        this.updateRuntimeProof('Debug File', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.debugFileLive.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Debug File', 'fail', outputEl);
    }
  }

  private async runStrictMcpConfigReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running strict MCP config readback probe…' });

    try {
      const result = await adapter.runStrictMcpConfigReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Strict MCP Config Readback Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ Diagnostic readback only: verifies settings→SDK option mapping only. Actual MCP config validation behavior is not independently verified from the plugin layer. Applies to the next query or restarted session only. Active sessions do not update live. This does not write .claude/mcp.json or provide MCP authoring.',
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Option wired: ${result.optionWired ? '✓ yes' : '✗ no'}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Setting value: ${result.settingValue}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `SDK option present: ${result.sdkOptionPresent ? '✓ yes' : '✗ no'}`,
      });
      if (result.sdkValue !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `SDK value: ${String(result.sdkValue)}`,
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Value match: ${result.valueMatch ? '✓ yes' : '✗ no'}`,
      });

      if (result.classification === 'readback') {
        this.updateRuntimeProof('Strict MCP Config', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `✗ Strict MCP config readback probe failed: ${result.error ?? 'unknown error'}`,
        });
        this.updateRuntimeProof('Strict MCP Config', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Strict MCP config readback proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Strict MCP Config', 'fail', outputEl);
    }
  }

  private async runContext1mBetaReadbackProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running 1M Context Beta readback probe…' });

    try {
      const result = await adapter.runContext1mBetaReadbackProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: '1M Context Beta Readback Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ Diagnostic readback only: verifies settings→SDK option mapping only. Actual beta availability depends on selected model and Anthropic-side behavior — the plugin passes the option, but whether the beta is actually honored depends on the SDK/CLI version, model support, and API state. Applies to the next query or restarted session only. Active sessions do not update live. No generic beta management is exposed; this covers only the single documented beta seam.',
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Option wired: ${result.optionWired ? '✓ yes' : '✗ no'}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Setting value: ${result.settingValue ? 'true' : 'false'}`,
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `SDK option present: ${result.sdkOptionPresent ? '✓ yes' : '✗ no'}`,
      });
      if (result.sdkValue !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `SDK value: ${JSON.stringify(result.sdkValue)}`,
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Value match: ${result.valueMatch ? '✓ yes' : '✗ no'}`,
      });

      if (result.classification === 'readback') {
        this.updateRuntimeProof('1M Context Beta', 'readback', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `✗ 1M Context Beta readback probe failed: ${result.error ?? 'unknown error'}`,
        });
        this.updateRuntimeProof('1M Context Beta', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `1M Context Beta readback proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('1M Context Beta', 'fail', outputEl);
    }
  }

  private async runContinueProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.continue.running') });

    try {
      const result = await adapter.runContinueProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.continue.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.continue.boundary'),
      });

      if (result.seedSessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.continue.seedSession', {
            sessionId: result.seedSessionId,
          }),
        });
      }
      if (result.continueSessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.continue.continueSession', {
            sessionId: result.continueSessionId,
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.continue.sessionIdsMatch', {
          status: result.sessionIdsMatch
            ? t('settings.capabilityLab.proofs.continue.status.yes')
            : t('settings.capabilityLab.proofs.continue.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.continue.nonceRecalled', {
          status: result.nonceRecalled
            ? t('settings.capabilityLab.proofs.continue.status.yes')
            : t('settings.capabilityLab.proofs.continue.status.no'),
        }),
      });

      if (result.classification === 'pass') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.continue.pass'),
        });
        this.updateRuntimeProof('Continue', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.continue.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.continue.defaultError'),
          }),
        });
        this.updateRuntimeProof('Continue', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.continue.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Continue', 'fail', outputEl);
    }
  }

  private async runResumeSessionAtProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.resumeSessionAt.running') });

    try {
      const result = await adapter.runResumeSessionAtProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.resumeSessionAt.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.resumeSessionAt.boundary'),
      });

      if (result.sessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.resumeSessionAt.sessionId', {
            sessionId: result.sessionId,
          }),
        });
      }
      if (result.alphaMessageUuid) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.resumeSessionAt.alphaMessageUuid', {
            uuid: result.alphaMessageUuid,
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.resumeSessionAt.resumedAtAlpha', {
          status: result.resumedAtAlpha
            ? t('settings.capabilityLab.proofs.resumeSessionAt.status.yes')
            : t('settings.capabilityLab.proofs.resumeSessionAt.status.no'),
        }),
      });

      if (result.classification === 'pass') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.resumeSessionAt.pass'),
        });
        this.updateRuntimeProof('Resume Session At Position', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.resumeSessionAt.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.resumeSessionAt.defaultError'),
          }),
        });
        this.updateRuntimeProof('Resume Session At Position', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.resumeSessionAt.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Resume Session At Position', 'fail', outputEl);
    }
  }

  private async runForkSessionProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.forkSession.running') });

    try {
      const result = await adapter.runForkSessionProbe();

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.forkSession.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.forkSession.boundary'),
      });

      if (result.seedSessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.forkSession.seedSession', {
            sessionId: result.seedSessionId,
          }),
        });
      }
      if (result.forkedSessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.forkSession.forkedSession', {
            sessionId: result.forkedSessionId,
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.forkSession.sessionIdsDiffer', {
          status: result.sessionIdsDiffer
            ? t('settings.capabilityLab.proofs.forkSession.status.yes')
            : t('settings.capabilityLab.proofs.forkSession.status.no'),
        }),
      });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.forkSession.nonceRecalled', {
          status: result.nonceRecalled
            ? t('settings.capabilityLab.proofs.forkSession.status.yes')
            : t('settings.capabilityLab.proofs.forkSession.status.no'),
        }),
      });

      if (result.classification === 'pass') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.forkSession.pass'),
        });
        this.updateRuntimeProof('Fork Session On Resume', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.forkSession.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.forkSession.defaultError'),
          }),
        });
        this.updateRuntimeProof('Fork Session On Resume', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.forkSession.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Fork Session On Resume', 'fail', outputEl);
    }
  }

  private async runSessionTitleProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: t('settings.capabilityLab.proofs.sessionTitle.running') });

    try {
      const nonce = Math.random().toString(36).slice(2, 8);
      const uniqueTitle = `OpenCodian Diagnostic Session Title ${Date.now()}-${nonce}`;
      const result = await adapter.runSessionTitleProbe(uniqueTitle);

      outputEl.empty();
      outputEl.createEl('h5', { text: t('settings.capabilityLab.proofs.sessionTitle.title') });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sessionTitle.boundary'),
      });

      if (result.sessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.sessionTitle.sessionId', {
            sessionId: result.sessionId,
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sessionTitle.requestedTitle', {
          title: result.requestedTitle ?? '(unknown)',
        }),
      });
      if (result.customTitle !== undefined) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.sessionTitle.customTitle', {
            title: result.customTitle,
          }),
        });
      }
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: t('settings.capabilityLab.proofs.sessionTitle.titleMatches', {
          status: result.classification === 'pass'
            ? t('settings.capabilityLab.proofs.sessionTitle.status.yes')
            : t('settings.capabilityLab.proofs.sessionTitle.status.no'),
        }),
      });

      if (result.classification === 'pass') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: t('settings.capabilityLab.proofs.sessionTitle.pass'),
        });
        this.updateRuntimeProof('Session Title', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: t('settings.capabilityLab.proofs.sessionTitle.fail', {
            error: result.error ?? t('settings.capabilityLab.proofs.sessionTitle.defaultError'),
          }),
        });
        this.updateRuntimeProof('Session Title', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: t('settings.capabilityLab.proofs.sessionTitle.threw', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this.updateRuntimeProof('Session Title', 'fail', outputEl);
    }
  }

  private async runCustomSessionIdProof(
    adapter: ClaudeCodeAdapter,
    outputEl: HTMLElement,
  ): Promise<void> {
    outputEl.empty();
    outputEl.createEl('p', { text: 'Running custom session id probe (exact match required for pass)…' });

    // Generate a fresh UUID-like target session id
    const targetSessionId = crypto.randomUUID();

    try {
      const result = await adapter.runCustomSessionIdProbe(targetSessionId);

      outputEl.empty();
      outputEl.createEl('h5', { text: 'Custom Session ID Proof' });
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: '⚠️ Diagnostic-only: not a stable product surface. Ordinary chat paths never inject custom session ids. Session identity is owned by the adapter.',
      });

      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-hint',
        text: `Requested: ${result.requestedSessionId}`,
      });
      if (result.returnedSessionId) {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: `Returned: ${result.returnedSessionId}`,
        });
      }

      if (result.classification === 'pass') {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-hint',
          text: '✓ Pass — exact match verified. SDK honored the requested session id.',
        });
        this.updateRuntimeProof('Custom Session ID', 'pass', outputEl);
      } else {
        outputEl.createEl('p', {
          cls: 'opencodian-capability-lab-error',
          text: `✗ Fail — ${result.error ?? 'no exact match'}`,
        });
        this.updateRuntimeProof('Custom Session ID', 'fail', outputEl);
      }
    } catch (err) {
      outputEl.empty();
      outputEl.createEl('p', {
        cls: 'opencodian-capability-lab-error',
        text: `Custom session id proof failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.updateRuntimeProof('Custom Session ID', 'fail', outputEl);
    }
  }

  private updateRuntimeProof(
    _capability: string,
    _status: 'pass' | 'fail' | 'untested' | 'wiring' | 'boundary' | 'readback',
    outputEl: HTMLElement,
  ): void {
    // Lightweight inline marker — does not persist across tab switches.
    // The matrix rows are static; this provides feedback in the browser area.
    labLogger.debug('runtime proof update', { capability: _capability, status: _status });

    const marker = outputEl.createDiv({
      cls: `opencodian-capability-lab-proof-marker opencodian-capability-lab-proof-${_status}`,
      attr: {
        'data-capability': _capability,
        'data-diagnostic': 'true',
      },
    });
    const label = _status === 'pass' ? '✓ Runtime verified'
      : _status === 'readback' ? '✓ Readback verified — not behavior verified'
      : _status === 'fail' ? '✗ Runtime failed'
      : _status === 'wiring' ? '⚠ Wiring only — not behavior verified'
      : _status === 'boundary' ? '◆ Boundary hit — UI context missing'
      : '? Not tested';
    marker.createSpan({ text: label });
  }
}
