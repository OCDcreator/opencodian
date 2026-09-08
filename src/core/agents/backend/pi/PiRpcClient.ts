import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';

declare const PI_SERVICE_SOURCE: string | undefined;

// Transfer exactly the source byte count over stdin before JSONL requests. This
// avoids filesystem writes and Windows command-line limits without consuming RPC data.
const PI_SERVICE_BOOTSTRAP = `
const input = process.stdin;
const receiveSource = async () => {
  const source = input.read(Number(process.argv[1]));
  if (!source) return;
  input.removeListener('readable', receiveSource);
  try {
    const service = await import('data:text/javascript;base64,' + source.toString('base64'));
    await service.startPiService(process.argv[2], JSON.parse(process.argv[3]));
  } catch (error) {
    process.stdout.write(JSON.stringify({ type: 'transport_error', error: 'Pi service startup: ' + error.message }) + '\\n');
    process.exitCode = 1;
  }
};
input.on('readable', receiveSource);
`;

export type PiRecord = Record<string, unknown>;

export function piRecord(value: unknown): PiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PiRecord : {};
}

export interface PiRpcPort {
  request(command: PiRecord, timeoutMs?: number): Promise<PiRecord>;
  subscribe(listener: (event: PiRecord) => void): () => void;
  close(): void;
  respond?(response: PiRecord): void;
}

export interface PiLaunchOptions {
  workingDirectory: string;
  executablePath: string;
  sessionPath?: string;
  sessionDirectory: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  servicePath?: string;
  agentDirectory?: string;
  configurationOnly?: boolean;
}

/** Resolve the official npm CLI and its external Node runtime without executing a shell. */
export function resolvePiCommand(configuredPath: string): { command: string; prefix: string[] } {
  const home = homedir();
  const directories = [...new Set([
    ...(process.env.PATH ?? process.env.Path ?? '').split(path.delimiter),
    path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin'),
    path.join(home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin',
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '',
  ].filter(Boolean))];
  const explicit = configuredPath.trim().replace(/^~(?=[/\\])/, home);
  const candidates = explicit ? [explicit] : directories.map((dir) => path.join(dir, process.platform === 'win32' ? 'pi.cmd' : 'pi'));
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error('Pi CLI not found. Install @mariozechner/pi-coding-agent or configure its executable path.');
  let cli = realpathSync(executable);
  if (/\.(cmd|bat)$/i.test(cli)) {
    cli = path.join(path.dirname(cli), 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'cli.js');
  }
  const packageRoot = path.dirname(path.dirname(cli));
  try {
    const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as PiRecord;
    if (metadata.name !== '@mariozechner/pi-coding-agent' || path.basename(cli) !== 'cli.js') throw new Error('wrong package');
  } catch {
    throw new Error('Pi executable must point to the official @mariozechner/pi-coding-agent CLI (pi or dist/cli.js).');
  }
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  const nodeCandidates = [
    path.join(path.dirname(executable), nodeName),
    path.resolve(packageRoot, '../../../bin', nodeName),
    ...directories.map((dir) => path.join(dir, nodeName)),
  ];
  const command = nodeCandidates.find((candidate) => existsSync(candidate));
  if (!command) throw new Error('Pi requires an external Node.js installation on PATH.');
  return { command, prefix: [cli] };
}

interface PendingRequest {
  resolve(value: PiRecord): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout> | undefined;
  command: string;
}

/** JSONL transport only. Pi runs in a separate, independently upgradeable process. */
export class PiRpcClient implements PiRpcPort {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Set<(event: PiRecord) => void>();
  private sequence = 0;
  private buffer = '';
  private closed = false;
  private killRequested = false;

  constructor(options: PiLaunchOptions) {
    const { command, prefix } = resolvePiCommand(options.executablePath);
    const sdkEntry = path.join(path.dirname(prefix[0]), 'index.js');
    const source = typeof PI_SERVICE_SOURCE === 'string' ? PI_SERVICE_SOURCE : undefined;
    const servicePath = options.servicePath;
    if (!source && (!servicePath || !existsSync(servicePath))) throw new Error('Pi service code is missing from the plugin build.');
    const args = source
      ? ['--input-type=module', '--eval', PI_SERVICE_BOOTSTRAP, String(Buffer.byteLength(source)), sdkEntry, JSON.stringify(options)]
      : [servicePath!, sdkEntry, JSON.stringify(options)];
    this.child = spawn(command, args, { cwd: options.workingDirectory, shell: false, windowsHide: true,
      env: { ...process.env, PATH: `${path.dirname(command)}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ''}` },
      stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (data: string) => this.receive(data));
    // Drain stderr; credential-bearing diagnostics must never enter chat or logs.
    this.child.stderr.resume();
    this.child.stdin.on('error', () => this.fail(new Error('Pi RPC input closed.')));
    this.child.on('error', (error) => this.fail(new Error(`Pi process failed: ${error.message}`)));
    this.child.on('exit', (code, signal) => this.fail(new Error(`Pi process exited (${signal ?? code ?? 'unknown'}).`)));
    if (source) this.child.stdin.write(source);
  }

  request(command: PiRecord, timeoutMs = 30000): Promise<PiRecord> {
    if (this.closed) return Promise.reject(new Error('Pi RPC connection is closed.'));
    const id = `pi-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Pi ${String(command.type)} timed out.`));
        this.close();
      }, timeoutMs) : undefined;
      this.pending.set(id, { resolve, reject, timer, command: String(command.type) });
      this.child.stdin.write(`${JSON.stringify({ ...command, id })}\n`, (error) => {
        if (error) this.fail(new Error('Unable to write Pi RPC request.'));
      });
    });
  }

  subscribe(listener: (event: PiRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  respond(response: PiRecord): void {
    if (!this.closed) this.child.stdin.write(`${JSON.stringify({ ...response, type: 'extension_ui_response' })}\n`);
  }

  close(): void {
    if (this.killRequested) return;
    this.killRequested = true;
    this.fail(new Error('Pi RPC connection closed.'));
    this.child.stdin.write(`${JSON.stringify({ type: 'shutdown' })}\n`, () => {});
    const killTimer = setTimeout(() => { if (this.child.exitCode === null) this.child.kill('SIGKILL'); }, 2000);
    killTimer.unref?.();
    this.child.once('exit', () => clearTimeout(killTimer));
  }

  private receive(data: string): void {
    this.buffer += data;
    // Bound broken-peer output; LF alone frames records, preserving U+2028/U+2029.
    if (this.buffer.length > 32 * 1024 * 1024) {
      this.fail(new Error('Pi RPC record exceeds 32 MiB.'));
      this.close();
      return;
    }
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let event: PiRecord;
      try { event = piRecord(JSON.parse(line)); } catch {
        this.fail(new Error('Pi returned invalid JSONL. Check CLI/protocol compatibility.'));
        this.close();
        return;
      }
      this.handleEvent(event);
    }
  }

  private handleEvent(event: PiRecord): void {
    if (event.type === 'response') {
      const pending = this.pending.get(String(event.id));
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(String(event.id));
      if (event.success === true && event.command === pending.command) pending.resolve(piRecord(event.data));
      else pending.reject(new Error(`Pi ${pending.command}: ${String(event.error ?? 'invalid response')}`));
      return;
    }
    if (event.type === 'transport_error') { this.fail(new Error(String(event.error))); return; }
    this.emit(event);
  }

  private emit(event: PiRecord): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* Isolate observers from transport state. */ }
    }
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit({ type: 'transport_error', error: error.message });
    this.listeners.clear();
  }
}
