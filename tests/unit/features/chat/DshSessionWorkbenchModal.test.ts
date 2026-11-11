import type { App } from 'obsidian';

import { type DshJobView, dshNativeControlCapabilities, type DshNativeControlUpdate } from '../../../../src/core/agents/backend/dsh/DshNativeControls';
import { DshSessionWorkbenchModal, type DshWorkbenchService } from '../../../../src/features/chat/ui/DshSessionWorkbenchModal';
import { t } from '../../../../src/i18n';

async function settle() { for (let i = 0; i < 30; ++i) await Promise.resolve(); }
function fixture() {
  const job: DshJobView = { id: 'job-a', owner: 'parent-a', kind: 'shell', label: 'Index sources', status: 'running', startedAt: 1, output: { total: 10, earliest: 0 } };
  const capabilities = dshNativeControlCapabilities({ nativeProtocol: 'opencodian.dsh-native/1', controlCapabilities: {
    jobs: { list: true, get: true, read: true, readAt: true, wait: true, kill: true, updates: true },
    terminal: { availability: true, list: true, spawn: true, read: true, send: true, signal: true, kill: true },
    subagents: { list: true, get: true, cancel: true },
  } }, true);
  const listeners = new Set<(event: DshNativeControlUpdate) => void>();
  const service = {
    getNativeControlCapabilities: jest.fn(() => capabilities),
    subscribeToNativeControlUpdates: jest.fn((listener: (event: DshNativeControlUpdate) => void) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; }),
    listSessionJobs: jest.fn(async () => [job]), getSessionJob: jest.fn(async () => job),
    readSessionJob: jest.fn(async () => ({ chunks: [{ at: 0, text: 'job output' }], lossy: false, job })),
    readSessionJobAt: jest.fn(async () => ({ chunks: [{ at: 4, text: 'next output' }], lossy: false, next: 20 })),
    waitForSessionJob: jest.fn(async () => job), killSessionJob: jest.fn(async () => ({ disposition: 'requested', job })),
    getSessionTerminalAvailability: jest.fn(async () => ({ available: true, backends: ['local-pty'] })),
    listSessionTerminals: jest.fn(async () => [{ sessionId: 'terminal-a', type: 'local-pty', name: 'Build', status: { kind: 'running' } }]),
    spawnSessionTerminal: jest.fn(async () => ({ sessionId: 'terminal-b', type: 'local-pty', status: { kind: 'running' }, motd: '' })),
    readSessionTerminal: jest.fn(async () => ({ text: 'terminal output', totalLines: 300, lineBegin: 0, lineEnd: 200, truncated: true })),
    sendSessionTerminal: jest.fn(async () => ({ viewport: 'sent', waitReason: 'inferred_idle', sessionStatus: { kind: 'running' }, truncated: false })),
    signalSessionTerminal: jest.fn(async () => ({ delivered: true, targetPgid: 1 })), killSessionTerminal: jest.fn(async () => ({ closed: true })),
    listSessionSubagents: jest.fn(async () => [{ id: 'child-a', createdAt: 1, mode: 'one-shot', label: 'Research', status: 'running', readable: true }]),
    getSessionSubagent: jest.fn(async () => ({ id: 'child-a', createdAt: 1, mode: 'one-shot', status: 'running' })),
    cancelSessionSubagent: jest.fn(async () => ({ accepted: true, child: { id: 'child-a', createdAt: 1, mode: 'one-shot', status: 'cancelled' } })),
    readChildSessionMessages: jest.fn(async () => [{ id: 'message-a', role: 'assistant', content: 'Child result', timestamp: 1 }]),
  };
  let current = true;
  const host = { service: service as unknown as DshWorkbenchService, sessionId: 'parent-a', isCurrent: () => current, openSettings: jest.fn() };
  const modal = new DshSessionWorkbenchModal({} as App, host); document.body.appendChild(modal.contentEl); modal.onOpen();
  return { modal, service, host, job, capabilities, listeners,
    emit: (event: DshNativeControlUpdate) => { for (const listener of listeners) listener(event); },
    leave: () => { current = false; },
    button: (key: Parameters<typeof t>[0], section?: string) => {
      const root = section ? modal.contentEl.querySelector<HTMLElement>(`[data-dsh-item="${section}"]`)! : modal.contentEl;
      return [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label') === t(key))!;
    },
  };
}

describe('DSH session workbench', () => {
  const active: DshSessionWorkbenchModal[] = [];
  const create = () => { const f = fixture(); active.push(f.modal); return f; };
  afterEach(() => { active.splice(0).forEach((modal) => modal.onClose()); document.body.innerHTML = ''; jest.restoreAllMocks(); });

  it('awaits optional capability refresh before discovering a newly mounted terminal extension', async () => {
    const f = create(); await settle();
    f.capabilities.controls.terminal.availability = false; f.capabilities.controls.terminal.list = false;
    await f.modal.refresh();
    expect(f.modal.contentEl.textContent).toContain(t('chat.dsh.workbench.noTerminalBackend'));
    let release!: () => void;
    const refreshCapabilities = jest.fn(() => new Promise<typeof f.capabilities>((resolve) => {
      release = () => {
        f.capabilities.controls.terminal.availability = true; f.capabilities.controls.terminal.list = true;
        resolve(f.capabilities);
      };
    }));
    Object.assign(f.service, { refreshNativeControlCapabilities: refreshCapabilities });
    f.service.listSessionJobs.mockClear(); f.service.getSessionTerminalAvailability.mockClear();
    const refreshing = f.modal.refresh();
    expect(refreshCapabilities).toHaveBeenCalledTimes(1);
    expect(f.service.listSessionJobs).not.toHaveBeenCalled();
    expect(f.service.getSessionTerminalAvailability).not.toHaveBeenCalled();
    release(); await refreshing;
    expect(f.service.getSessionTerminalAvailability).toHaveBeenCalledWith('parent-a');
    expect(f.button('chat.dsh.workbench.spawnTerminal').disabled).toBe(false);
    expect(f.service.spawnSessionTerminal).not.toHaveBeenCalled();
  });

  it('ignores a late capability result after the session owner changes', async () => {
    const f = create(); await settle(); let release!: () => void;
    Object.assign(f.service, { refreshNativeControlCapabilities: jest.fn(() => new Promise<typeof f.capabilities>((resolve) => {
      release = () => resolve(f.capabilities);
    })) });
    f.service.listSessionJobs.mockClear(); f.service.listSessionTerminals.mockClear();
    const refreshing = f.modal.refresh(); f.leave(); release(); await refreshing;
    expect(f.service.listSessionJobs).not.toHaveBeenCalled();
    expect(f.service.listSessionTerminals).not.toHaveBeenCalled();
  });

  it('disables native actions during failed capability discovery and preserves drafts for retry', async () => {
    const f = create(); await settle();
    const input = f.modal.contentEl.querySelector<HTMLInputElement>('input[type="password"]')!; input.value = 'unfinished';
    const refreshCapabilities = jest.fn().mockRejectedValue(new Error('private capability failure'));
    Object.assign(f.service, { refreshNativeControlCapabilities: refreshCapabilities });
    f.service.listSessionJobs.mockClear();
    const refreshing = f.modal.refresh();
    expect(f.button('chat.dsh.workbench.sendInput', 'terminal:terminal-a').disabled).toBe(true);
    await refreshing;
    expect(f.modal.contentEl.textContent).toContain(t('chat.dsh.controls.failed'));
    expect(f.modal.contentEl.textContent).not.toContain('private capability failure');
    for (const key of ['chat.dsh.workbench.spawnTerminal', 'chat.dsh.workbench.stopJob', 'chat.dsh.workbench.output', 'chat.dsh.workbench.cancelChild'] as const) {
      expect(f.button(key).disabled).toBe(true);
    }
    f.button('chat.dsh.workbench.sendInput', 'terminal:terminal-a').click();
    expect(f.service.sendSessionTerminal).not.toHaveBeenCalled(); expect(f.service.listSessionJobs).not.toHaveBeenCalled();
    expect(f.button('chat.dsh.controls.refresh').disabled).toBe(false);
    expect(f.button('chat.dsh.workbench.settings').disabled).toBe(false);
    refreshCapabilities.mockResolvedValue(f.capabilities);
    await f.modal.refresh();
    expect(f.modal.contentEl.querySelector('input[type="password"]')).toBe(input); expect(input.value).toBe('unfinished');
    expect(f.button('chat.dsh.workbench.sendInput', 'terminal:terminal-a').disabled).toBe(false);
  });

  it('re-evaluates action capabilities on existing terminal rows without replacing drafts', async () => {
    const f = create(); await settle();
    const input = f.modal.contentEl.querySelector<HTMLInputElement>('input[type="password"]')!; input.value = 'unfinished';
    const refreshCapabilities = jest.fn(async () => {
      f.capabilities.controls.terminal.spawn = false; f.capabilities.controls.terminal.send = false;
      return f.capabilities;
    });
    Object.assign(f.service, { refreshNativeControlCapabilities: refreshCapabilities });
    await f.modal.refresh();
    expect(f.button('chat.dsh.workbench.spawnTerminal').disabled).toBe(true);
    expect(f.button('chat.dsh.workbench.sendInput', 'terminal:terminal-a').disabled).toBe(true);
    refreshCapabilities.mockImplementation(async () => {
      f.capabilities.controls.terminal.spawn = true; f.capabilities.controls.terminal.send = true;
      return f.capabilities;
    });
    await f.modal.refresh();
    expect(f.button('chat.dsh.workbench.spawnTerminal').disabled).toBe(false);
    expect(f.button('chat.dsh.workbench.sendInput', 'terminal:terminal-a').disabled).toBe(false);
    expect(f.modal.contentEl.querySelector('input[type="password"]')).toBe(input); expect(input.value).toBe('unfinished');
  });

  it('loads owned jobs, terminals and children without executing any action', async () => {
    const f = create(); await settle();
    expect(f.service.listSessionJobs).toHaveBeenCalledWith('parent-a');
    expect(f.service.listSessionTerminals).toHaveBeenCalledWith('parent-a');
    expect(f.service.listSessionSubagents).toHaveBeenCalledWith('parent-a');
    expect(f.modal.contentEl.textContent).toContain('Index sources'); expect(f.modal.contentEl.textContent).toContain('Research');
    expect(f.service.spawnSessionTerminal).not.toHaveBeenCalled(); expect(f.service.sendSessionTerminal).not.toHaveBeenCalled();
    expect(f.service.killSessionJob).not.toHaveBeenCalled(); expect(f.service.cancelSessionSubagent).not.toHaveBeenCalled();
  });

  it('offers user-operated job details, bounded output, offset reads, bounded wait and stop', async () => {
    const f = create(); await settle();
    f.button('chat.dsh.workbench.details', 'job:job-a').click(); await settle();
    f.button('chat.dsh.workbench.output', 'job:job-a').click(); await settle();
    const offset = f.modal.contentEl.querySelector<HTMLInputElement>('[data-dsh-item="job:job-a"] input')!; offset.value = '4';
    f.button('chat.dsh.workbench.readAt', 'job:job-a').click(); await settle();
    f.button('chat.dsh.workbench.wait', 'job:job-a').click(); await settle();
    f.button('chat.dsh.workbench.stopJob', 'job:job-a').click(); await settle();
    expect(f.service.getSessionJob).toHaveBeenCalledWith('parent-a', 'job-a');
    expect(f.service.readSessionJob).toHaveBeenCalledWith('parent-a', 'job-a');
    expect(f.service.readSessionJobAt).toHaveBeenCalledWith('parent-a', 'job-a', { from: 4 });
    expect(f.service.waitForSessionJob).toHaveBeenCalledWith('parent-a', 'job-a', { timeoutMs: 1000 });
    expect(f.service.killSessionJob).toHaveBeenCalledWith('parent-a', 'job-a');
  });

  it('uses exact native terminal fields and does not retain submitted input', async () => {
    const f = create(); await settle();
    f.button('chat.dsh.workbench.spawnTerminal').click(); await settle();
    expect(f.service.spawnSessionTerminal).toHaveBeenCalledWith('parent-a', { type: 'local-pty' });
    const input = f.modal.contentEl.querySelector<HTMLInputElement>('input[type="password"]')!; input.value = 'private input';
    f.button('chat.dsh.workbench.sendInput', 'terminal:terminal-a').click(); await settle();
    expect(f.service.sendSessionTerminal).toHaveBeenCalledWith('parent-a', 'terminal-a', { text: 'private input', submit: true });
    expect(input.value).toBe(''); expect(f.modal.contentEl.textContent).not.toContain('private input');
    f.button('chat.dsh.workbench.output', 'terminal:terminal-a').click(); await settle();
    expect(f.service.readSessionTerminal).toHaveBeenCalledWith('parent-a', 'terminal-a', { offset: 0, count: 200 });
    const signal = [...f.modal.contentEl.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === t('chat.dsh.workbench.signal', { signal: 'SIGINT' }))!;
    signal.click(); await settle(); expect(f.service.signalSessionTerminal).toHaveBeenCalledWith('parent-a', 'terminal-a', 'SIGINT');
    f.button('chat.dsh.workbench.closeTerminal', 'terminal:terminal-a').click(); await settle();
    expect(f.service.killSessionTerminal).toHaveBeenCalledWith('parent-a', 'terminal-a');
  });

  it.each(['success', 'failure'])('preserves a newer terminal draft while an earlier send settles with %s', async (outcome) => {
    const f = create(); await settle();
    let resolve!: (value: Awaited<ReturnType<typeof f.service.sendSessionTerminal>>) => void;
    let reject!: (error: Error) => void;
    f.service.sendSessionTerminal.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
    const input = f.modal.contentEl.querySelector<HTMLInputElement>('input[type="password"]')!;
    const send = f.button('chat.dsh.workbench.sendInput', 'terminal:terminal-a');
    input.value = 'first command'; send.click();
    expect(f.service.sendSessionTerminal).toHaveBeenCalledWith('parent-a', 'terminal-a', { text: 'first command', submit: true });
    input.value = 'next draft'; send.click();
    expect(f.service.sendSessionTerminal).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('next draft');
    expect(f.button('chat.dsh.workbench.closeTerminal', 'terminal:terminal-a').disabled).toBe(false);
    const signal = [...f.modal.contentEl.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.getAttribute('aria-label') === t('chat.dsh.workbench.signal', { signal: 'SIGINT' }))!;
    expect(signal.disabled).toBe(false);
    if (outcome === 'success') resolve({ viewport: 'sent', waitReason: 'inferred_idle', sessionStatus: { kind: 'running' }, truncated: false });
    else reject(new Error('send failed'));
    await settle();
    expect(input.value).toBe('next draft');
    expect(f.service.sendSessionTerminal).toHaveBeenCalledTimes(1);
  });

  it('preserves a terminal input draft while list updates arrive', async () => {
    const f = create(); await settle(); const input = f.modal.contentEl.querySelector<HTMLInputElement>('input[type="password"]')!;
    input.value = 'unfinished'; f.emit({ kind: 'session', sessionId: 'parent-a', update: { sessionUpdate: 'jobs_update', jobs: [] } }); await settle();
    expect(f.modal.contentEl.querySelector('input[type="password"]')).toBe(input); expect(input.value).toBe('unfinished');
  });

  it('shows a settings action when there is no terminal backend', async () => {
    const f = create(); await settle(); f.service.getSessionTerminalAvailability.mockResolvedValue({ available: false, backends: [] });
    await f.modal.refresh(); expect(f.modal.contentEl.textContent).toContain(t('chat.dsh.workbench.noTerminalBackend'));
    f.button('chat.dsh.workbench.settings').click(); expect(f.host.openSettings).toHaveBeenCalledTimes(1);
    expect(f.button('chat.dsh.workbench.spawnTerminal')).toBeUndefined();
  });

  it('reads child history and cancels only through the owning parent', async () => {
    const f = create(); await settle();
    f.button('chat.dsh.workbench.history', 'child:child-a').click(); await settle();
    expect(f.service.readChildSessionMessages).toHaveBeenCalledWith('parent-a', 'child-a');
    f.button('chat.dsh.workbench.cancelChild', 'child:child-a').click(); await settle();
    expect(f.service.cancelSessionSubagent).toHaveBeenCalledWith('parent-a', 'child-a');
    f.leave(); f.button('chat.dsh.workbench.cancelChild', 'child:child-a').click();
    expect(f.service.cancelSessionSubagent).toHaveBeenCalledTimes(1);
  });

  it('masks known secret shapes, bounds output and preserves safe error feedback', async () => {
    const f = create(); await settle();
    f.service.readSessionTerminal.mockResolvedValueOnce({ text: `api_key=sk-secret12345678901234567890\n${'x'.repeat(80_000)}`, totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: false });
    f.button('chat.dsh.workbench.output', 'terminal:terminal-a').click(); await settle();
    const output = f.modal.contentEl.querySelector('[data-dsh-item="terminal:terminal-a"] pre')!;
    expect(output.textContent).not.toContain('sk-secret12345678901234567890'); expect(output.textContent!.length).toBeLessThan(66_000);
    f.service.killSessionJob.mockRejectedValueOnce(new Error('private credential'));
    f.button('chat.dsh.workbench.stopJob', 'job:job-a').click(); await settle();
    expect(f.modal.contentEl.textContent).toContain(t('chat.dsh.controls.failed')); expect(f.modal.contentEl.textContent).not.toContain('private credential');
  });

  it('discards late output and ignores events from another session', async () => {
    const f = create(); await settle(); const calls = f.service.listSessionJobs.mock.calls.length;
    f.emit({ kind: 'session', sessionId: 'parent-b', update: { sessionUpdate: 'jobs_update', jobs: [] } }); await settle();
    expect(f.service.listSessionJobs).toHaveBeenCalledTimes(calls);
    let release!: (value: { text: string; totalLines: number; lineBegin: number; lineEnd: number; truncated: boolean }) => void;
    f.service.readSessionTerminal.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    f.button('chat.dsh.workbench.output', 'terminal:terminal-a').click(); f.leave();
    release({ text: 'stale session output', totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: false }); await settle();
    expect(f.modal.contentEl.textContent).not.toContain('stale session output');
  });
});
