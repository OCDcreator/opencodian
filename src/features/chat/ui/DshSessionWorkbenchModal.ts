import { type App, Modal, setIcon } from 'obsidian';

import type { Disposable } from '../../../core/agents/backend/AgentService';
import type {
  DshJobView, DshNativeControlCapabilities, DshNativeControls,
DshNativeControlUpdate,   DshSubagentView, DshTerminalSnapshot,
} from '../../../core/agents/backend/dsh/DshNativeControls';
import type { ChatMessage } from '../../../core/types';
import { t } from '../../../i18n';
import { sanitizeDiagnosticReport } from '../../../shared/diagnosticSecretSanitizer';

export type DshWorkbenchService = Pick<DshNativeControls,
  'listSessionJobs' | 'getSessionJob' | 'readSessionJob' | 'readSessionJobAt' | 'waitForSessionJob' | 'killSessionJob'
  | 'getSessionTerminalAvailability' | 'listSessionTerminals' | 'spawnSessionTerminal' | 'readSessionTerminal'
  | 'sendSessionTerminal' | 'signalSessionTerminal' | 'killSessionTerminal'
  | 'listSessionSubagents' | 'getSessionSubagent' | 'cancelSessionSubagent'> & {
    getNativeControlCapabilities(): DshNativeControlCapabilities;
    refreshNativeControlCapabilities?(): Promise<DshNativeControlCapabilities>;
    subscribeToNativeControlUpdates(handler: (update: DshNativeControlUpdate) => void): Disposable;
    readChildSessionMessages(parentSessionId: string, childSessionId: string): Promise<ChatMessage[]>;
  };

export interface DshSessionWorkbenchHost {
  service: DshWorkbenchService;
  sessionId: string;
  isCurrent(): boolean;
  openSettings(): void;
}

/** User-operated, exact-session native tools. Jobs remain independent of Todos. */
export class DshSessionWorkbenchModal extends Modal {
  private active = false;
  private generation = 0;
  private subscription: Disposable | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private reading = false;
  private readAgain = false;
  private capabilitiesReady = true;
  private status: HTMLElement | null = null;
  private jobs: HTMLElement | null = null;
  private terminals: HTMLElement | null = null;
  private children: HTMLElement | null = null;
  private terminalForm: HTMLElement | null = null;
  private jobsEmpty: HTMLElement | null = null;
  private terminalsEmpty: HTMLElement | null = null;
  private childrenEmpty: HTMLElement | null = null;
  private feedback = '';
  private readonly actionAvailability = new Map<HTMLButtonElement, () => boolean>();
  private readonly rows = new Map<string, { root: HTMLElement; summary: HTMLElement; output: HTMLElement; state: string }>();
  private readonly operations = new Set<string>();
  private readonly outputReads = new Map<string, number>();

  constructor(app: App, private readonly host: DshSessionWorkbenchHost) { super(app); }

  onOpen(): void {
    this.active = true; ++this.generation;
    this.setTitle(t('chat.dsh.workbench.title'));
    this.contentEl.addClass('opencodian-workbench-desktop', 'opencodian-workbench-page', 'opencodian-dsh-session-workbench');
    this.contentEl.createDiv({ cls: 'opencodian-workbench-muted', text: t('chat.dsh.workbench.scope', { session: this.host.sessionId }) });
    const actions = this.contentEl.createDiv({ cls: 'opencodian-workbench-actions' });
    this.button(actions, t('chat.dsh.controls.refresh'), { icon: 'refresh-cw' }, () => this.refresh());
    this.button(actions, t('chat.dsh.workbench.settings'), { icon: 'settings' }, () => this.host.openSettings());
    this.status = this.contentEl.createDiv({ cls: 'opencodian-workbench-muted', attr: { role: 'status', 'aria-live': 'polite' } });
    this.jobs = this.section('chat.dsh.workbench.jobs');
    this.jobsEmpty = this.jobs.createDiv({ cls: 'opencodian-workbench-muted' });
    this.terminals = this.section('chat.dsh.workbench.terminals');
    this.terminalForm = this.terminals.createDiv();
    this.terminalsEmpty = this.terminals.createDiv({ cls: 'opencodian-workbench-muted' });
    this.children = this.section('chat.dsh.workbench.children');
    this.childrenEmpty = this.children.createDiv({ cls: 'opencodian-workbench-muted' });
    this.subscription = this.host.service.subscribeToNativeControlUpdates((update) => {
      if (!this.current()) return;
      if (update.kind === 'invalidated') { this.close(); return; }
      if (update.kind === 'configuration' || update.kind === 'session' && update.sessionId === this.host.sessionId
        || update.kind === 'busy' && update.sessionId === this.host.sessionId && !update.busy) void this.refresh();
    });
    this.timer = setInterval(() => { if (this.current()) void this.refresh(); else this.close(); }, 5000);
    void this.refresh();
  }

  private current(generation = this.generation): boolean { return this.active && generation === this.generation && this.host.isCurrent(); }

  async refresh(): Promise<void> {
    if (!this.current()) return;
    if (this.reading) { this.readAgain = true; return; }
    this.reading = true;
    const generation = this.generation; const service = this.host.service; const id = this.host.sessionId;
    this.status?.setText(this.feedback || t('chat.dsh.controls.checking'));
    this.capabilitiesReady = !service.refreshNativeControlCapabilities;
    this.syncActionAvailability();
    try {
      await service.refreshNativeControlCapabilities?.();
      if (!this.current(generation)) return;
      this.capabilitiesReady = true;
      const caps = service.getNativeControlCapabilities().controls;
      const [jobs, terminalAvailability, terminals, children] = await Promise.allSettled([
        caps.jobs.list ? service.listSessionJobs(id) : Promise.resolve(null),
        caps.terminal.availability ? service.getSessionTerminalAvailability(id) : Promise.resolve(null),
        caps.terminal.list ? service.listSessionTerminals(id) : Promise.resolve(null),
        caps.subagents.list ? service.listSessionSubagents(id) : Promise.resolve(null),
      ]);
      if (!this.current(generation)) return;
      if (jobs.status === 'fulfilled') this.renderJobs(jobs.value);
      if (terminalAvailability.status === 'fulfilled') this.renderTerminalForm(terminalAvailability.value);
      if (terminals.status === 'fulfilled') this.renderTerminals(terminals.value);
      if (children.status === 'fulfilled') this.renderChildren(children.value);
      const failed = [jobs, terminalAvailability, terminals, children].some((result) => result.status === 'rejected');
      this.status?.setText(this.feedback || (failed ? t('chat.dsh.controls.failed') : ''));
    } catch {
      if (this.current(generation)) {
        this.capabilitiesReady = false;
        this.status?.setText(t('chat.dsh.controls.failed'));
      }
    } finally {
      if (this.current(generation)) {
        this.reading = false;
        this.syncActionAvailability();
        if (this.readAgain) { this.readAgain = false; void this.refresh(); }
      }
    }
  }

  private renderJobs(jobs: DshJobView[] | null): void {
    this.jobsEmpty?.setText(jobs === null ? t('chat.dsh.controls.unavailable') : jobs.length ? '' : t('chat.dsh.workbench.noJobs'));
    for (const job of jobs ?? []) {
      if (job.owner !== this.host.sessionId) continue;
      const key = `job:${job.id}`;
      const { row, added } = this.row(this.jobs!, key, `${job.label} · ${job.status}`, job.status);
      if (!added) continue;
      const actions = row.root.createDiv({ cls: 'opencodian-workbench-actions' });
      this.button(actions, t('chat.dsh.workbench.details'), { icon: 'info', enabled: () => this.host.service.getNativeControlCapabilities().controls.jobs.get }, () => this.operation(key, async () => {
        const detail = await this.host.service.getSessionJob(this.host.sessionId, job.id);
        return [detail.label, detail.kind, detail.status, detail.progress, detail.detail].filter(Boolean).join('\n');
      }));
      this.button(actions, t('chat.dsh.workbench.output'), { icon: 'file-text', enabled: () => this.host.service.getNativeControlCapabilities().controls.jobs.read }, () => this.operation(key, async () => {
        const result = await this.host.service.readSessionJob(this.host.sessionId, job.id);
        return this.outputText(result.chunks.map((chunk) => chunk.text).join(''), result.lossy, result.result);
      }));
      const offset = this.input(row.root, t('chat.dsh.workbench.jobOffset'), 'number'); offset.min = '0'; offset.step = '1'; offset.value = '0';
      this.button(actions, t('chat.dsh.workbench.readAt'), { icon: 'text-cursor-input', enabled: () => this.host.service.getNativeControlCapabilities().controls.jobs.readAt }, () => {
        const from = Number(offset.value);
        if (!Number.isSafeInteger(from) || from < 0) { this.status?.setText(t('chat.dsh.workbench.invalidOffset')); return; }
        return this.operation(key, async () => {
          const result = await this.host.service.readSessionJobAt(this.host.sessionId, job.id, { from });
          return this.outputText(result.chunks.map((chunk) => chunk.text).join(''), result.lossy)
            + `\n${t('chat.dsh.workbench.nextOffset', { offset: String(result.next) })}`;
        });
      });
      this.button(actions, t('chat.dsh.workbench.wait'), { icon: 'clock', enabled: () => this.host.service.getNativeControlCapabilities().controls.jobs.wait }, () => this.operation(key, async () => {
        const result = await this.host.service.waitForSessionJob(this.host.sessionId, job.id, { timeoutMs: 1000 });
        return `${result.label} · ${result.status}`;
      }));
      this.button(actions, t('chat.dsh.workbench.stopJob'), { icon: 'square', enabled: () => this.host.service.getNativeControlCapabilities().controls.jobs.kill && ['running', 'stopping'].includes(this.rows.get(key)?.state ?? '') }, () => this.operation(key, async () => {
        const result = await this.host.service.killSessionJob(this.host.sessionId, job.id);
        return t(result.disposition === 'requested' ? 'chat.dsh.workbench.stopRequested' : 'chat.dsh.workbench.alreadyFinished');
      }));
    }
    this.prune('job:', new Set((jobs ?? []).map((job) => `job:${job.id}`)));
  }

  private renderTerminalForm(availability: { available: boolean; backends: string[] } | null): void {
    const form = this.terminalForm!;
    const fingerprint = JSON.stringify(availability);
    if (form.dataset.readback === fingerprint) return;
    form.dataset.readback = fingerprint; form.empty();
    if (!availability?.available || !availability.backends.length) {
      form.createDiv({ cls: 'opencodian-workbench-muted', text: t('chat.dsh.workbench.noTerminalBackend') });
      this.button(form, t('chat.dsh.workbench.settings'), { icon: 'settings' }, () => this.host.openSettings());
      return;
    }
    const label = form.createEl('label', { cls: 'opencodian-workbench-field' });
    label.createSpan({ text: t('chat.dsh.workbench.terminalBackend') });
    const select = label.createEl('select');
    select.setAttribute('aria-label', t('chat.dsh.workbench.terminalBackend'));
    for (const backend of availability.backends) select.createEl('option', { value: backend, text: backend });
    const name = this.input(form, t('chat.dsh.workbench.terminalName'));
    const cwd = this.input(form, t('chat.dsh.workbench.terminalDirectory'));
    this.button(form, t('chat.dsh.workbench.spawnTerminal'), { icon: 'plus', enabled: () => this.host.service.getNativeControlCapabilities().controls.terminal.spawn }, () => {
      const type = select.value;
      if (!availability.backends.includes(type)) return;
      return this.operation('spawn', async () => {
        const result = await this.host.service.spawnSessionTerminal(this.host.sessionId, {
          type, ...(name.value.trim() ? { name: name.value.trim() } : {}), ...(cwd.value.trim() ? { cwd: cwd.value.trim() } : {}),
        });
        return `${result.name ?? result.sessionId} · ${result.status.kind}`;
      });
    });
  }

  private renderTerminals(terminals: DshTerminalSnapshot[] | null): void {
    this.terminalsEmpty?.setText(terminals === null ? t('chat.dsh.controls.unavailable') : terminals.length ? '' : t('chat.dsh.workbench.noTerminals'));
    for (const terminal of terminals ?? []) {
      const id = terminal.sessionId; const key = `terminal:${id}`;
      const { row, added } = this.row(this.terminals!, key, `${terminal.name ?? id} · ${terminal.type} · ${terminal.status.kind}`, terminal.status.kind);
      if (!added) continue;
      const actions = row.root.createDiv({ cls: 'opencodian-workbench-actions' });
      const offset = this.input(row.root, t('chat.dsh.workbench.terminalOffset'), 'number'); offset.value = '0'; offset.min = '0'; offset.step = '1';
      this.button(actions, t('chat.dsh.workbench.output'), { icon: 'file-text', enabled: () => this.host.service.getNativeControlCapabilities().controls.terminal.read }, () => {
        const from = Number(offset.value);
        if (!Number.isSafeInteger(from) || from < 0) { this.status?.setText(t('chat.dsh.workbench.invalidOffset')); return; }
        return this.operation(key, async () => {
          const result = await this.host.service.readSessionTerminal(this.host.sessionId, id, { offset: from, count: 200 });
          return this.outputText(result.text, result.truncated)
            + `\n${t('chat.dsh.workbench.lines', { begin: String(result.lineBegin), end: String(result.lineEnd), total: String(result.totalLines) })}`;
        });
      });
      const input = this.input(row.root, t('chat.dsh.workbench.terminalInput'), 'password');
      input.autocomplete = 'off'; input.spellcheck = false;
      const submitLabel = row.root.createEl('label', { cls: 'opencodian-workbench-field' });
      const submit = submitLabel.createEl('input', { type: 'checkbox' }); submit.checked = true;
      submitLabel.createSpan({ text: t('chat.dsh.workbench.submitLine') });
      const running = () => this.rows.get(key)?.state === 'running';
      this.button(actions, t('chat.dsh.workbench.sendInput'), { icon: 'send', enabled: () => this.host.service.getNativeControlCapabilities().controls.terminal.send && running() }, () => {
        if (this.operations.has(`${key}:send`)) return;
        const text = input.value; input.value = '';
        if (!text && !submit.checked) return;
        return this.operation(`${key}:send`, async () => {
          const result = await this.host.service.sendSessionTerminal(this.host.sessionId, id, { text, submit: submit.checked });
          return this.outputText(result.viewport, result.truncated) + `\n${result.waitReason} · ${result.sessionStatus.kind}`;
        }, key);
      });
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGTSTP', 'SIGHUP'] as const) {
        this.button(actions, t('chat.dsh.workbench.signal', { signal }), { icon: 'zap', enabled: () => this.host.service.getNativeControlCapabilities().controls.terminal.signal && running() }, () => this.operation(`${key}:signal`, async () => {
          await this.host.service.signalSessionTerminal(this.host.sessionId, id, signal);
          return t('chat.dsh.workbench.signalSent', { signal });
        }, key));
      }
      this.button(actions, t('chat.dsh.workbench.closeTerminal'), { icon: 'square', enabled: () => this.host.service.getNativeControlCapabilities().controls.terminal.kill && running() }, () => this.operation(`${key}:kill`, async () => {
        const result = await this.host.service.killSessionTerminal(this.host.sessionId, id);
        return t(result.closed ? 'chat.dsh.workbench.terminalClosed' : 'chat.dsh.workbench.notConfirmed');
      }, key));
    }
    this.prune('terminal:', new Set((terminals ?? []).map((terminal) => `terminal:${terminal.sessionId}`)));
  }

  private renderChildren(children: DshSubagentView[] | null): void {
    this.childrenEmpty?.setText(children === null ? t('chat.dsh.controls.unavailable') : children.length ? '' : t('chat.dsh.workbench.noChildren'));
    for (const child of children ?? []) {
      const key = `child:${child.id}`;
      const { row, added } = this.row(this.children!, key, `${child.label ?? child.id} · ${child.status ?? t('chat.dsh.workbench.unknown')}`, child.status ?? 'unknown');
      if (!added) continue;
      const actions = row.root.createDiv({ cls: 'opencodian-workbench-actions' });
      this.button(actions, t('chat.dsh.workbench.details'), { icon: 'info', enabled: () => this.host.service.getNativeControlCapabilities().controls.subagents.get }, () => this.operation(key, async () => {
        const result = await this.host.service.getSessionSubagent(this.host.sessionId, child.id);
        return [result.label ?? result.id, result.mode, result.status ?? t('chat.dsh.workbench.unknown')].join('\n');
      }));
      this.button(actions, t('chat.dsh.workbench.history'), { icon: 'messages-square', enabled: () => child.readable !== false }, () => this.operation(key, async () => {
        const messages = await this.host.service.readChildSessionMessages(this.host.sessionId, child.id);
        return messages.map((message) => [message.content, ...(message.toolCalls ?? []).map((tool) => tool.result ?? '')].filter(Boolean).join('\n')).join('\n\n')
          || t('chat.dsh.workbench.noOutput');
      }));
      this.button(actions, t('chat.dsh.workbench.cancelChild'), { icon: 'square', enabled: () => this.host.service.getNativeControlCapabilities().controls.subagents.cancel && !['completed', 'failed', 'cancelled', 'killed'].includes(this.rows.get(key)?.state ?? '') }, () => this.operation(key, async () => {
        const result = await this.host.service.cancelSessionSubagent(this.host.sessionId, child.id);
        return t('chat.dsh.workbench.cancelAccepted', { status: result.child.status ?? t('chat.dsh.workbench.unknown') });
      }));
    }
    this.prune('child:', new Set((children ?? []).map((child) => `child:${child.id}`)));
  }

  private section(key: 'chat.dsh.workbench.jobs' | 'chat.dsh.workbench.terminals' | 'chat.dsh.workbench.children'): HTMLElement {
    const section = this.contentEl.createEl('details', { cls: 'opencodian-workbench-section' });
    section.open = key === 'chat.dsh.workbench.jobs';
    section.createEl('summary', { cls: 'opencodian-workbench-section-heading', text: t(key) });
    return section.createDiv({ cls: 'opencodian-workbench-section-body' });
  }

  private row(parent: HTMLElement, key: string, title: string, state: string): { row: { root: HTMLElement; summary: HTMLElement; output: HTMLElement; state: string }; added: boolean } {
    let row = this.rows.get(key);
    const added = !row;
    if (!row) {
      const root = parent.createEl('details', { cls: 'opencodian-workbench-task' }); root.dataset.dshItem = key;
      const summary = root.createEl('summary');
      const output = root.createEl('pre', { attr: { tabindex: '0', 'aria-label': t('chat.dsh.workbench.output') } });
      output.hidden = true;
      row = { root, summary, output, state }; this.rows.set(key, row);
    }
    row.state = state; row.summary.setText(this.safeText(title));
    return { row, added };
  }

  private prune(prefix: string, retained: Set<string>): void {
    for (const [key, row] of this.rows) if (key.startsWith(prefix) && !retained.has(key)) {
      row.root.remove(); this.rows.delete(key); this.outputReads.delete(key);
    }
  }

  private input(parent: HTMLElement, title: string, type = 'text'): HTMLInputElement {
    const label = parent.createEl('label', { cls: 'opencodian-workbench-field' }); label.createSpan({ text: title });
    return label.createEl('input', { type, attr: { 'aria-label': title } });
  }

  private button(parent: HTMLElement, title: string, options: { icon: string; enabled?: () => boolean }, action: () => void | Promise<void>): HTMLButtonElement {
    const { icon, enabled } = options;
    // Native actions supply a live capability predicate; local retry/settings do not.
    const isEnabled = () => !enabled || this.capabilitiesReady && enabled();
    const button = parent.createEl('button', { cls: 'opencodian-workbench-button', attr: { type: 'button', 'aria-label': title } });
    setIcon(button.createSpan(), icon); button.createSpan({ text: title }); button.disabled = !isEnabled();
    if (enabled) this.actionAvailability.set(button, isEnabled);
    button.addEventListener('click', () => {
      if (!this.current() || button.disabled || !isEnabled()) return;
      void Promise.resolve(action()).catch(() => { if (this.current()) this.status?.setText(t('chat.dsh.controls.failed')); });
    });
    return button;
  }

  private syncActionAvailability(): void {
    for (const [button, enabled] of this.actionAvailability) {
      if (!this.contentEl.contains(button)) this.actionAvailability.delete(button);
      else button.disabled = !enabled();
    }
  }

  private async operation(key: string, action: () => Promise<string>, outputKey = key): Promise<void> {
    if (!this.current() || this.operations.has(key)) return;
    const generation = this.generation;
    const sequence = (this.outputReads.get(outputKey) ?? 0) + 1; this.outputReads.set(outputKey, sequence);
    this.operations.add(key); this.feedback = ''; this.status?.setText(t('chat.dsh.controls.checking'));
    try {
      const result = await action();
      if (!this.current(generation) || sequence !== this.outputReads.get(outputKey)) return;
      const output = this.rows.get(outputKey)?.output;
      if (output) { output.setText(this.safeText(result)); output.hidden = false; }
      else { this.feedback = this.safeText(result); this.status?.setText(this.feedback); }
    } catch {
      if (this.current(generation)) { this.feedback = t('chat.dsh.controls.failed'); this.status?.setText(this.feedback); }
    } finally {
      this.operations.delete(key);
      if (this.current(generation)) void this.refresh();
    }
  }

  private outputText(text: string, truncated: boolean, result?: string): string {
    return [text || t('chat.dsh.workbench.noOutput'), result, truncated ? t('chat.dsh.workbench.truncated') : ''].filter(Boolean).join('\n');
  }

  private safeText(text: string): string {
    const bounded = sanitizeDiagnosticReport(text, { urlPolicy: 'strict' });
    return bounded.length > 65_536 ? `${bounded.slice(0, 65_536)}\n${t('chat.dsh.workbench.truncated')}` : bounded;
  }

  onClose(): void {
    this.active = false; ++this.generation;
    this.reading = false; this.readAgain = false; this.capabilitiesReady = false;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.subscription?.dispose(); this.subscription = null;
    this.rows.clear(); this.operations.clear(); this.outputReads.clear(); this.actionAvailability.clear();
    this.contentEl.empty();
  }
}
