/** Host-owned PTYs and explicit Git operations. No backend or chat state lives here. */
import { type ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export interface WorkbenchGitFile { path: string; index: string; workingTree: string }
export interface WorkbenchGitSnapshot { root: string; branch: string; files: WorkbenchGitFile[]; worktrees: string }
export interface WorkbenchTerminalState { status: 'starting' | 'running' | 'exited' | 'failed'; cwd: string; pid?: number; error?: string; output: string }
type TerminalEvent = { type: 'data'; data: string } | { type: 'state'; state: WorkbenchTerminalState };
interface TerminalRecord {
  child: ChildProcessWithoutNullStreams;
  state: WorkbenchTerminalState;
  listeners: Set<(event: TerminalEvent) => void>;
  decoder: StringDecoder;
}

function environment(): NodeJS.ProcessEnv {
  const common = [process.env.PATH ?? process.env.Path ?? '', '/opt/homebrew/bin', '/usr/local/bin',
    path.join(homedir(), '.local/bin'), path.join(homedir(), '.local/share/fnm/aliases/default/bin')];
  return { ...process.env, PATH: [...new Set(common.filter(Boolean))].join(path.delimiter) };
}

/** A view owns this runtime. Closing a panel preserves its PTYs; disposing the view stops its own children. */
export class WorkbenchHostRuntime {
  private readonly terminals = new Map<string, TerminalRecord>();
  private disposed = false;

  constructor(private readonly assetsDirectory: string) {}

  getTerminal(identity: string): WorkbenchTerminalState | null {
    const state = this.terminals.get(identity)?.state;
    return state ? { ...state } : null;
  }

  listTerminals(): Array<{ identity: string; state: WorkbenchTerminalState }> {
    return [...this.terminals].map(([identity,record])=>({identity,state:{...record.state}}));
  }

  subscribeTerminal(identity: string, listener: (event: TerminalEvent) => void): () => void {
    const record = this.terminals.get(identity);
    if (!record) throw new Error('Open a terminal before subscribing');
    record.listeners.add(listener);
    return () => { record.listeners.delete(listener); };
  }

  async startTerminal(identity: string, directory: string): Promise<WorkbenchTerminalState> {
    if (this.disposed) throw new Error('Workbench runtime is disposed');
    const existing = this.terminals.get(identity);
    if (existing && ['starting', 'running'].includes(existing.state.status)) return { ...existing.state };
    const cwd = await realpath(directory);
    const windows = process.platform === 'win32';
    const env = environment();
    let command: string;
    let args: string[];
    if (windows) {
      const source = await readFile(path.join(this.assetsDirectory, 'terminal.ps1'), 'utf8');
      command = 'powershell.exe'; args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')];
      env.OPENCODIAN_WORKBENCH_CWD = cwd;
    } else {
      command = 'python3'; args = ['-u', path.join(this.assetsDirectory, 'terminal.py'), cwd];
    }
    if (this.disposed) throw new Error('Workbench runtime was disposed during startup');
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const record: TerminalRecord = { child, state: { status: 'starting', cwd, output: '' }, listeners: new Set(), decoder: new StringDecoder('utf8') };
    this.terminals.set(identity, record);
    let input = ''; let stderr = '';
    const emit = (event: TerminalEvent) => {
      for (const listener of record.listeners) { try { listener(event); } catch { /* Detached terminal views are isolated. */ } }
    };
    const state = () => emit({ type: 'state', state: { ...record.state } });
    child.stdout.on('data', (chunk: Buffer) => {
      input += chunk.toString('utf8');
      if (input.length > 2 * 1024 * 1024) { record.state.status = 'failed'; record.state.error = 'Invalid terminal frame'; child.kill(); state(); return; }
      for (;;) {
        const index = input.indexOf('\n'); if (index < 0) break;
        const line = input.slice(0, index); input = input.slice(index + 1);
        try {
          const message = JSON.parse(line) as { type?: string; data?: string; pid?: number; message?: string };
          if (message.type === 'ready') { record.state.status = 'running'; record.state.pid = message.pid; state(); }
          else if (message.type === 'data' && typeof message.data === 'string') {
            const data = record.decoder.write(Buffer.from(message.data, 'base64'));
            record.state.output = (record.state.output + data).slice(-512 * 1024);
            emit({ type: 'data', data });
          } else if (message.type === 'error') { record.state.status = 'failed'; record.state.error = message.message ?? 'Terminal failed'; state(); }
          else if (message.type === 'exit') { record.state.status = 'exited'; state(); }
        } catch { record.state.status = 'failed'; record.state.error = 'Invalid terminal response'; state(); }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-8192); });
    child.stdin.on('error', (error) => {
      if (record.state.status === 'running' || record.state.status === 'starting') {
        record.state.status = 'failed'; record.state.error = error.message; state();
      }
    });
    child.on('error', (error) => { record.state.status = 'failed'; record.state.error = error.message; state(); });
    child.on('exit', (code) => {
      if (record.state.status !== 'failed') record.state.status = code && code !== 0 ? 'failed' : 'exited';
      if (record.state.status === 'failed' && !record.state.error) record.state.error = stderr || `Terminal helper exited (${code})`;
      state();
    });
    return { ...record.state };
  }

  writeTerminal(identity: string, data: string): void { this.sendTerminal(identity, { type: 'input', data }); }
  resizeTerminal(identity: string, cols: number, rows: number): void { this.sendTerminal(identity, { type: 'resize', cols, rows }); }

  stopTerminal(identity: string): void {
    const record = this.terminals.get(identity);
    if (!record || record.child.exitCode !== null) return;
    this.sendTerminal(identity, { type: 'close' });
    record.child.stdin.end();
    const timer = setTimeout(() => { if (record.child.exitCode === null) record.child.kill(); }, 3000);
    timer.unref?.();
  }

  private sendTerminal(identity: string, value: Record<string, unknown>): void {
    const record = this.terminals.get(identity);
    if (!record || record.child.stdin.destroyed) return;
    record.child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  async readGit(directory: string): Promise<WorkbenchGitSnapshot> {
    const cwd = await realpath(directory);
    const root = (await this.git(cwd, ['rev-parse', '--show-toplevel'])).trim();
    const [branch, status, worktrees] = await Promise.all([
      this.git(root, ['branch', '--show-current']), this.git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
      this.git(root, ['worktree', 'list', '--porcelain']),
    ]);
    const files: WorkbenchGitFile[] = [];
    const entries = status.split('\0');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]; if (entry.length < 4) continue;
      files.push({ path: entry.slice(3), index: entry[0], workingTree: entry[1] });
      if (/[RC]/.test(entry.slice(0, 2))) i++;
    }
    return { root, branch: branch.trim() || '(detached HEAD)', files, worktrees };
  }

  async gitDiff(directory: string, file?: WorkbenchGitFile): Promise<string> {
    const cwd = await realpath(directory);
    if (file) this.assertRelativePath(file.path);
    if (file?.index === '?' && file.workingTree === '?') {
      const root = (await this.git(cwd, ['rev-parse', '--show-toplevel'])).trim();
      const target = await realpath(path.join(root, file.path));
      if (!this.inside(root, target)) throw new Error('File preview is outside the repository');
      return (await readFile(target, 'utf8')).slice(0, 200000);
    }
    return this.git(cwd, ['diff', '--no-ext-diff', '--no-color', ...(file?.index.trim() && file.index !== '?' ? ['--cached'] : []), '--', ...(file ? [file.path] : [])]);
  }

  async stageFile(directory: string, file: string, staged: boolean): Promise<void> {
    this.assertRelativePath(file);
    await this.git(directory, staged ? ['add', '--', file] : ['restore', '--staged', '--', file]);
  }

  async commit(directory: string, message: string): Promise<string> {
    if (!message.trim()) throw new Error('A commit message is required');
    return this.git(directory, ['commit', '-m', message]);
  }

  async createWorktree(directory: string, target: string, branch: string): Promise<void> {
    if (!path.isAbsolute(target)) throw new Error('Choose an absolute worktree directory');
    const absolute = path.resolve(target);
    const cwd = await realpath(directory);
    if (this.inside(cwd, absolute)) throw new Error('Choose a worktree directory outside the current workspace');
    await this.git(directory, ['check-ref-format', '--branch', branch]);
    await this.git(directory, ['worktree', 'add', '-b', branch, absolute]);
  }

  private assertRelativePath(file: string): void {
    if (!file || path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || file.includes('\0')) throw new Error('Invalid repository-relative file');
  }

  private inside(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }

  private git(directory: string, args: string[]): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('Workbench runtime is disposed'));
    return new Promise((resolve, reject) => execFile('git', ['--no-optional-locks', ...args],
      { cwd: directory, env: environment(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000, windowsHide: true },
      (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout)));
  }

  dispose(): void {
    this.disposed = true;
    for (const identity of this.terminals.keys()) this.stopTerminal(identity);
    for (const record of this.terminals.values()) record.listeners.clear();
  }
}
