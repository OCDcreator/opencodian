import { existsSync } from 'fs';
import { Notice } from 'obsidian';
import { isAbsolute } from 'path';

import type { AgentBackendKind } from '../../../core/types/chat';
import { type BackendSettings, type BackendSettingsRecoveryPoint, normalizeBackendSettings, type OpenCodianSettings } from '../../../core/types/settings';
import { t } from '../../../i18n';

interface BackendWorkspaceHost {
  settings: Pick<OpenCodianSettings, 'backendSettings' | 'backendSettingsRecoveryPoints'>;
  saveSettings(): Promise<void>;
}

type WorkspaceBackend = 'opencode2' | 'claude-code' | 'codex' | 'pi' | 'zcode' | 'dsh';

const BACKEND_KEYS: Record<WorkspaceBackend, Exclude<keyof BackendSettings, 'opencode'>> = {
  opencode2: 'opencode2',
  'claude-code': 'claudeCode',
  codex: 'codex',
  pi: 'pi',
  zcode: 'zcode',
  dsh: 'dsh',
};

// Credentials, environment, raw configuration and executable arguments stay in
// their original stores. Native configuration editors own revision-safe history.
const RECOVERY_FIELDS: Record<WorkspaceBackend, readonly string[]> = {
  opencode2: ['mode', 'executablePath', 'permissionMode'],
  'claude-code': [
    'executablePath', 'settingSources', 'permissionMode', 'thinking', 'effort',
    'additionalDirectories', 'model', 'fallbackModel', 'allowedTools',
    'disallowedTools', 'restrictedBuiltinTools', 'maxTurns', 'maxBudgetUsd',
    'taskBudget', 'enableFileCheckpointing', 'includeHookEvents',
    'forwardSubagentText', 'agentProgressSummaries', 'promptSuggestions',
    'sandbox', 'strictMcpConfig', 'enableContext1mBeta', 'outputStyle', 'autoTitle',
  ],
  codex: [
    'executablePath', 'model', 'approvalPolicy', 'sandboxMode', 'webSearchMode',
    'networkAccessEnabled', 'additionalDirectories', 'modelReasoningEffort',
  ],
  pi: ['executablePath', 'provider', 'model', 'thinkingLevel'],
  zcode: ['executablePath', 'model', 'mode', 'thinkingLevel'],
  dsh: ['executablePath', 'workingDirectory', 'profile', 'transport'],
};

function asWorkspaceBackend(backend: AgentBackendKind): WorkspaceBackend | undefined {
  return Object.prototype.hasOwnProperty.call(BACKEND_KEYS, backend) ? backend as WorkspaceBackend : undefined;
}

function copyValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Capture only explicitly allowlisted, non-secret plugin defaults. */
export function captureBackendRecoveryPoint(
  settings: Pick<OpenCodianSettings, 'backendSettings'>,
  backend: AgentBackendKind,
  savedAt = Date.now(),
): BackendSettingsRecoveryPoint | undefined {
  const kind = asWorkspaceBackend(backend);
  if (!kind || !Number.isFinite(savedAt) || savedAt <= 0) return undefined;
  const source = settings.backendSettings[BACKEND_KEYS[kind]];
  const allowed = new Set(RECOVERY_FIELDS[kind]);
  const values = copyValue(Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key))));
  return { version: 1, savedAt, values };
}

/** Saved data is untrusted; a recovery point never grants new writable keys. */
export function readBackendRecoveryPoint(
  settings: Pick<OpenCodianSettings, 'backendSettingsRecoveryPoints'>,
  backend: AgentBackendKind,
): BackendSettingsRecoveryPoint | undefined {
  const kind = asWorkspaceBackend(backend);
  if (!kind) return undefined;
  const candidate = settings.backendSettingsRecoveryPoints?.[BACKEND_KEYS[kind]];
  if (!candidate || candidate.version !== 1 || !Number.isFinite(candidate.savedAt) || candidate.savedAt <= 0
    || !candidate.values || typeof candidate.values !== 'object' || Array.isArray(candidate.values)) return undefined;
  const allowed = new Set(RECOVERY_FIELDS[kind]);
  const values = Object.fromEntries(Object.entries(candidate.values).filter(([key]) => allowed.has(key)));
  if (!Object.keys(values).length) return undefined;
  return { version: 1, savedAt: candidate.savedAt, values: copyValue(values) };
}

export async function saveBackendRecoveryPoint(host: BackendWorkspaceHost, backend: AgentBackendKind): Promise<void> {
  const kind = asWorkspaceBackend(backend);
  const point = captureBackendRecoveryPoint(host.settings, backend);
  if (!kind || !point) throw new Error('Unsupported backend recovery scope');
  const previous = host.settings.backendSettingsRecoveryPoints;
  host.settings.backendSettingsRecoveryPoints = { ...previous, [BACKEND_KEYS[kind]]: point };
  try {
    await host.saveSettings();
  } catch (error) {
    host.settings.backendSettingsRecoveryPoints = previous;
    throw error;
  }
}

export async function restoreBackendRecoveryPoint(host: BackendWorkspaceHost, backend: AgentBackendKind): Promise<void> {
  const kind = asWorkspaceBackend(backend);
  const point = readBackendRecoveryPoint(host.settings, backend);
  if (!kind || !point) throw new Error('No valid backend recovery point');
  const key = BACKEND_KEYS[kind];
  const target = host.settings.backendSettings[key];
  const previous = copyValue(target);
  const normalized = normalizeBackendSettings({
    ...host.settings.backendSettings,
    [key]: { ...target, ...point.values },
  })[key];
  // Claude queries hold this object by reference. Preserve its identity, and
  // leave every other backend's live settings object untouched.
  Object.assign(target, normalized);
  try {
    await host.saveSettings();
  } catch (error) {
    Object.assign(target, previous);
    throw error;
  }
}

function renderMissingExecutable(
  container: HTMLElement,
  kind: WorkspaceBackend,
  host: BackendWorkspaceHost,
  onChange: () => void,
): void {
  const settings = host.settings.backendSettings[BACKEND_KEYS[kind]];
  const configured = settings.executablePath.trim();
  // A command name or a discovered installation must be resolved by its
  // backend. Only an explicitly missing absolute path is proven here.
  if (!configured || !isAbsolute(configured) || existsSync(configured)) return;
  const alert = container.createDiv({
    cls: 'opencodian-backend-empty',
    attr: { role: 'status', 'data-backend-installation': 'missing' },
  });
  alert.createEl('strong', { text: t('settings.backend.installation.missing') });
  alert.createEl('p', { text: t('settings.backend.installation.nextStep') });
  const feedback = alert.createEl('p', { attr: { role: 'status', 'aria-live': 'polite' } });
  const reset = alert.createEl('button', {
    text: t('settings.backend.installation.automatic'), attr: { type: 'button' },
  });
  reset.addEventListener('click', () => {
    void (async () => {
      reset.disabled = true;
      settings.executablePath = '';
      try {
        await host.saveSettings();
        new Notice(t('settings.backend.installation.saved'));
        onChange();
      } catch {
        settings.executablePath = configured;
        feedback.setText(t('settings.backend.recovery.failed'));
      } finally { reset.disabled = false; }
    })();
  });
}

/** Shared by the six backend workspaces and every settings host. */
export function renderBackendSettingsWorkspace(
  container: HTMLElement,
  backend: AgentBackendKind,
  host: BackendWorkspaceHost,
  onRestore: () => void,
): void {
  const kind = asWorkspaceBackend(backend);
  if (!kind) return;
  container.classList.add('opencodian-backend-workspace');
  container.dataset.backendWorkspace = backend;
  const connectionBackup = kind === 'dsh' || kind === 'opencode2';
  const backupPrefix = kind === 'dsh' ? 'settings.dsh.backup' : 'settings.opencode2.backup';
  const backupClass = kind === 'dsh' ? 'opencodian-dsh-backup' : 'opencodian-opencode2-backup';
  const bar = container.createDiv({ cls: 'opencodian-backend-workspace-bar' });
  if (connectionBackup) bar.addClass(kind === 'dsh' ? 'opencodian-dsh-connection-backup' : 'opencodian-opencode2-connection-backup');
  else {
    const copy = bar.createDiv({ cls: 'opencodian-backend-workspace-context' });
    copy.createEl('p', { cls: 'opencodian-backend-workspace-scope', text: t('settings.backend.workspace.scope') });
    copy.createEl('p', { cls: 'opencodian-backend-workspace-help', text: t('settings.backend.workspace.application') });
  }
  const recovery = bar.createEl('details', { cls: 'opencodian-backend-recovery' });
  const summary = recovery.createEl('summary');
  const summaryCopy = connectionBackup
    ? summary.createSpan({ cls: `${backupClass}-summary-copy` })
    : summary;
  summaryCopy.createSpan({
    cls: connectionBackup ? `${backupClass}-title` : undefined,
    text: connectionBackup ? t(`${backupPrefix}.title`) : t('settings.backend.recovery.title'),
  });
  const point = readBackendRecoveryPoint(host.settings, backend);
  const backupStatus = connectionBackup
    ? summaryCopy.createSpan({ cls: `${backupClass}-status` })
    : undefined;
  const body = recovery.createDiv({ cls: 'opencodian-backend-recovery-body' });
  body.createEl('p', {
    cls: 'opencodian-backend-workspace-help',
    text: connectionBackup
      ? t(`${backupPrefix}.description`)
      : point
        ? t('settings.backend.recovery.savedAt', { date: new Date(point.savedAt).toLocaleString() })
        : t('settings.backend.recovery.empty'),
  });
  body.createEl('p', {
    cls: 'opencodian-backend-workspace-help',
    text: connectionBackup ? t(`${backupPrefix}.scope`) : t('settings.backend.recovery.scope'),
  });
  if (connectionBackup) body.createEl('p', {
    cls: `opencodian-backend-workspace-help ${backupClass}-storage`,
    text: t(`${backupPrefix}.storage`),
  });
  const legacyFeedback = connectionBackup ? undefined : body.createEl('p', {
    cls: 'opencodian-backend-recovery-feedback', attr: { role: 'status', 'aria-live': 'polite' },
  });
  const actions = body.createDiv({ cls: 'opencodian-backend-recovery-actions' });
  const save = actions.createEl('button', { text: t('settings.backend.recovery.save'), attr: { type: 'button' } });
  const restore = actions.createEl('button', {
    text: connectionBackup ? t(`${backupPrefix}.restore`) : t('settings.backend.recovery.restore'),
    attr: { type: 'button' },
  });
  if (connectionBackup) body.createEl('p', {
    cls: `opencodian-backend-workspace-help ${backupClass}-effect`,
    text: t(`${backupPrefix}.effect`),
  });
  const feedback = legacyFeedback ?? body.createEl('p', {
    cls: 'opencodian-backend-recovery-feedback', attr: { role: 'status', 'aria-live': 'polite' },
  });
  const refreshBackupState = (): void => {
    const current = readBackendRecoveryPoint(host.settings, backend);
    restore.disabled = !current;
    if (!connectionBackup) return;
    save.setText(t(current ? `${backupPrefix}.update` : `${backupPrefix}.save`));
    backupStatus?.setText(current
      ? t(`${backupPrefix}.savedAt`, { date: new Date(current.savedAt).toLocaleString() })
      : t(`${backupPrefix}.empty`));
  };
  refreshBackupState();
  const run = async (action: 'save' | 'restore'): Promise<void> => {
    save.disabled = true;
    restore.disabled = true;
    feedback.dataset.state = 'busy';
    feedback.setText(t(connectionBackup
      ? action === 'save' ? `${backupPrefix}.saving` : `${backupPrefix}.restoring`
      : 'settings.backend.recovery.busy'));
    try {
      if (action === 'save') await saveBackendRecoveryPoint(host, backend);
      else await restoreBackendRecoveryPoint(host, backend);
      const success = t(connectionBackup
        ? action === 'save' ? `${backupPrefix}.saved` : `${backupPrefix}.restored`
        : action === 'save' ? 'settings.backend.recovery.saved' : 'settings.backend.recovery.restored');
      feedback.dataset.state = 'saved';
      feedback.setText(success);
      new Notice(success);
      if (action === 'restore') onRestore();
    } catch {
      feedback.dataset.state = 'error';
      feedback.setText(connectionBackup ? t(`${backupPrefix}.failed`) : t('settings.backend.recovery.failed'));
    } finally {
      save.disabled = false;
      refreshBackupState();
    }
  };
  save.addEventListener('click', () => { void run('save'); });
  restore.addEventListener('click', () => { void run('restore'); });
  renderMissingExecutable(container, kind, host, onRestore);
}
