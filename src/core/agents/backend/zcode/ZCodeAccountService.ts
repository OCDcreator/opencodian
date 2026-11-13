/** Official CLI OAuth with a machine-local OpenCodian credential boundary.
 * OAuth, encryption writes and token renewal remain owned by the installed CLI. */
import { spawn } from 'node:child_process';
import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { computeFileRevision, type FileRevision } from '../configuration/ProjectResourceSecureWrite';
import { readZCodeCredentialBytes, withZCodeFileLock, zcodeRecord } from './ZCodeNativeStore';
import { resolveOfficialZCodeDesktopBundle, type ZCodeRuntimeLaunch } from './ZCodeRuntimeResolver';

export type ZCodeAccountFamily = 'bigmodel' | 'zai';
export interface ZCodeAccountSnapshot {
  readonly state: 'signed-out' | 'signed-in' | 'signing-in' | 'unreadable';
  readonly accounts: readonly { family: ZCodeAccountFamily; name: string }[];
  readonly authorizeUrl?: string;
}
export interface ZCodeLoginProgress { readonly authorizeUrl: string }
export interface ZCodeLoginResult { readonly model: string; readonly account: ZCodeAccountSnapshot }
export interface ZCodeAccountServiceOptions {
  readonly rootPath?: string;
  readonly getLaunch: () => ZCodeRuntimeLaunch;
  readonly getEnvironment?: () => Record<string, string>;
  readonly spawnImpl?: typeof spawn;
  readonly timeoutMs?: number;
}

/** Official system cipher primitives (native systemCredentialCipher.ts, snapshot fec975905, v3.18.2):
 * key = sha256(secret utf8) digest, fingerprint = sha256(key bytes).hex.slice(0, 24),
 * sealed payload = base64url(iv).base64url(tag).base64url(ciphertext) AES-256-GCM.
 * The official codec lives inside the runtime bundle (no importable package), so the
 * byte shape is mirrored here instead of loading the bundle into the plugin process. */
function credentialDigest(value: string | Buffer): Buffer { return createHash('sha256').update(value).digest(); }

/** Same resolution order as the pinned account environment, so login, aux queries and
 * summary reads always agree on one key. Secret files are never read here. */
function resolveCredentialSecret(env: Readonly<Record<string, string | undefined>>): string {
  let username = 'unknown';
  try { username = os.userInfo().username; } catch { /* Match the native fallback. */ }
  return env.ZCODE_CREDENTIAL_SECRET?.trim()
    || `zcode-credential-fallback:${os.platform()}:${os.homedir()}:${username}`;
}

/** Shared aes-256-gcm open for the native sealed payload used by v1 and v2 envelopes. */
function openSealedPayload(parts: readonly string[], key: Buffer): string {
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]*$/.test(part))) throw new Error('zcode-credentials-invalid');
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error('zcode-credentials-invalid');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch { throw new Error('zcode-credentials-invalid'); }
}

/** Read only the profile summary using the official credential codecs (snapshot fec975905):
 * the legacy `enc:v1:` envelope and the system `enc:v2:{os|env}:<fingerprint24>:`
 * envelope that current runtimes write (including their automatic in-place v1→v2
 * migration, which would otherwise flip a signed-in account to unreadable). Only the
 * env (managed-secret) source is decodable in-process; os values use an OS keychain
 * key, stay unreadable by design, and never touch the keychain. Access/refresh
 * tokens never cross this service's public interface. */
function decodeProfile(value: string, env: Record<string, string>): Record<string, unknown> {
  let text = value;
  if (value.startsWith('enc:v1:')) {
    text = openSealedPayload(value.slice(7).split('.'), credentialDigest(resolveCredentialSecret(env)));
  } else if (value.startsWith('enc:v2:')) {
    const [source, fingerprint, sealed, ...unexpected] = value.slice(7).split(':');
    if (unexpected.length > 0 || source !== 'env' || !sealed || !/^[a-f0-9]{24}$/.test(fingerprint ?? '')) {
      throw new Error('zcode-credentials-invalid');
    }
    const key = credentialDigest(resolveCredentialSecret(env));
    // Mirror the native fingerprint gate: a mismatch means the key material changed,
    // so refuse up front instead of degrading into an opaque auth failure.
    if (credentialDigest(key).toString('hex').slice(0, 24) !== fingerprint) throw new Error('zcode-credentials-invalid');
    text = openSealedPayload(sealed.split('.'), key);
  } else if (value.startsWith('enc:')) {
    throw new Error('zcode-credentials-invalid');
  }
  return zcodeRecord(JSON.parse(text));
}

export class ZCodeAccountService {
  readonly rootPath: string;
  private activeController: AbortController | null = null;
  private authorizeUrl: string | undefined;
  private committing = false;

  constructor(private readonly options: ZCodeAccountServiceOptions) {
    this.rootPath = options.rootPath ?? path.join(os.homedir(), '.opencodian', 'zcode', 'account');
  }

  get credentialsPath(): string { return path.join(this.rootPath, '.zcode', 'v2', 'credentials.json'); }

  /** Applied after user environment so the Desktop credentials cannot leak in. */
  getEnvironment(): Record<string, string> {
    const configured = this.options.getEnvironment?.() ?? {};
    // Aux queries deliberately replace HOME. Pin the official cipher's normal
    // local-user key so that they can read the same plugin credentials.
    const secret = resolveCredentialSecret({
      ZCODE_CREDENTIAL_SECRET: configured.ZCODE_CREDENTIAL_SECRET?.trim() || process.env.ZCODE_CREDENTIAL_SECRET,
    });
    return {
      ...configured,
      ZCODE_DATA_BASE_DIR: this.rootPath,
      ZCODE_CREDENTIAL_SECRET: secret,
      // The plugin owns this account secret, so children must never see a competing
      // managed-secret file (inherited or configured): the official cipher refuses
      // when both sources are set. Empty string keeps the pinned env source exclusive
      // without reading any user secret file. Applies to login/logout, the app-server
      // child, and aux sessions because they all merge this record last.
      ZCODE_CREDENTIAL_SECRET_FILE: '',
    };
  }

  revision(): string {
    try {
      const metadata = lstatSync(this.credentialsPath);
      const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1_048_576
        || normalize(realpathSync(path.dirname(this.credentialsPath))) !== normalize(path.resolve(path.dirname(this.credentialsPath)))) {
        throw new Error('zcode-credentials-invalid');
      }
      return createHash('sha256').update(readFileSync(this.credentialsPath)).digest('hex');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'signed-out';
      throw error;
    }
  }

  async read(): Promise<ZCodeAccountSnapshot> {
    try {
      await this.ensurePrivateRoot();
      if (this.activeController) return { state: 'signing-in', accounts: [], authorizeUrl: this.authorizeUrl };
      const raw = await readZCodeCredentialBytes(this.credentialsPath);
      if (raw === null) return { state: 'signed-out', accounts: [] };
      const credentials = zcodeRecord(JSON.parse(raw));
      const accounts: Array<{ family: ZCodeAccountFamily; name: string }> = [];
      for (const family of ['bigmodel', 'zai'] as const) {
        const user = credentials[`oauth:${family}:user_info`];
        const token = credentials[`oauth:${family}:access_token`];
        if (typeof user !== 'string' || typeof token !== 'string' || !token) continue;
        const profile = decodeProfile(user, this.getEnvironment());
        const name = [profile.displayName, profile.name, profile.username, profile.email, profile.user_id, profile.id].find((value) => typeof value === 'string' && value);
        if (typeof name !== 'string') throw new Error('zcode-credentials-invalid');
        accounts.push({ family, name: name.slice(0, 120) });
      }
      return { state: accounts.length ? 'signed-in' : 'signed-out', accounts };
    } catch { return { state: 'unreadable', accounts: [] }; }
  }

  cancelLogin(): void { if (!this.committing) this.activeController?.abort(); }

  async openDesktop(): Promise<void> {
    const bundle = resolveOfficialZCodeDesktopBundle();
    if (!bundle) throw new Error('zcode-desktop-unavailable');
    const command = process.platform === 'darwin' ? 'open'
      : path.resolve(path.dirname(bundle), '..', '..', process.platform === 'win32' ? 'ZCode.exe' : 'zcode');
    const args = process.platform === 'darwin' ? ['-a', path.resolve(path.dirname(bundle), '..', '..', '..')] : [];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
      child.once('error', () => reject(new Error('zcode-desktop-unavailable')));
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  }

  async login(family: ZCodeAccountFamily, onProgress: (progress: ZCodeLoginProgress) => void): Promise<ZCodeLoginResult> {
    if (!['bigmodel', 'zai'].includes(family)) throw new Error('zcode-login-provider-invalid');
    return this.transaction(async (operationRoot, signal) => {
      const result = await this.run(['login', family, '--json', '--no-browser'], operationRoot, signal, (progress) => {
        this.authorizeUrl = progress.authorizeUrl; onProgress(progress);
      });
      if (result.status !== 'ready' || result.provider !== family || typeof result.model !== 'string') throw new Error('zcode-login-response-invalid');
      return { model: result.model };
    }).then(async (result) => ({ ...result, account: await this.read() }));
  }

  async logout(): Promise<void> {
    await this.transaction(async (operationRoot, signal) => {
      const result = await this.run(['logout', '--json'], operationRoot, signal);
      if (result.status !== 'logged_out') throw new Error('zcode-login-response-invalid');
    });
  }

  private async transaction<T>(action: (root: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.activeController) throw new Error('zcode-login-busy');
    const controller = new AbortController();
    this.activeController = controller;
    try {
      await this.ensurePrivateRoot();
      return await withZCodeFileLock(path.join(this.rootPath, 'account-operation'), async () => {
        if (controller.signal.aborted) throw new Error('zcode-login-cancelled');
        const directory = path.dirname(this.credentialsPath);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const expected = await computeFileRevision(this.credentialsPath);
        const original = await readZCodeCredentialBytes(this.credentialsPath);
        const operationRoot = await mkdtemp(path.join(this.rootPath, 'login-'));
        const stageDirectory = path.join(operationRoot, '.zcode', 'v2');
        await mkdir(stageDirectory, { recursive: true, mode: 0o700 });
        const stageCredentials = path.join(stageDirectory, 'credentials.json');
        const stageConfig = path.join(stageDirectory, 'provider_config.json');
        let staged = original ?? '{}';
        try {
          const record: unknown = JSON.parse(staged);
          if (!record || typeof record !== 'object' || Array.isArray(record) || Object.values(record).some((value) => typeof value !== 'string')) staged = '{}';
        } catch { staged = '{}'; }
        // A fresh successful login can repair a corrupt plugin credential
        // document. The canonical bytes remain untouched on cancel/failure.
        await writeFile(stageCredentials, staged, { mode: 0o600 });
        await writeFile(stageConfig, JSON.stringify({ schemaVersion: 1, config: {
          providerConfigRules: { providerRules: [] }, modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
        } }), { mode: 0o600 });
        try {
          const result = await action(operationRoot, controller.signal);
          if (controller.signal.aborted) throw new Error('zcode-login-cancelled');
          const content = await readFile(stageCredentials, 'utf8');
          const record = zcodeRecord(JSON.parse(content));
          if (Object.values(record).some((value) => typeof value !== 'string')) throw new Error('zcode-credentials-invalid');
          if (controller.signal.aborted) throw new Error('zcode-login-cancelled');
          this.committing = true;
          await this.commit(content, expected);
          return result;
        } finally {
          // Exact owned files only. Native CLI logs/directories stay private;
          // never recursively clean a path outside the repository.
          for (const owned of [stageCredentials, stageConfig]) await unlink(owned).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
        }
      });
    } finally { this.activeController = null; this.authorizeUrl = undefined; this.committing = false; }
  }

  private async ensurePrivateRoot(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true, mode: 0o700 });
    const canonical = await realpath(this.rootPath);
    const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
    if (normalize(canonical) !== normalize(path.resolve(this.rootPath))) throw new Error('zcode-credentials-invalid');
    if (process.platform !== 'win32') await chmod(this.rootPath, 0o700);
    const directory = path.dirname(this.credentialsPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (normalize(await realpath(directory)) !== normalize(path.resolve(directory))) throw new Error('zcode-credentials-invalid');
    if (process.platform !== 'win32') {
      await chmod(path.dirname(directory), 0o700);
      await chmod(directory, 0o700);
    }
  }

  private async commit(content: string, expectedRevision: FileRevision | null): Promise<void> {
    await withZCodeFileLock(this.credentialsPath, async () => {
      const current = await computeFileRevision(this.credentialsPath);
      if ((current?.sha256 ?? null) !== (expectedRevision?.sha256 ?? null)) throw new Error('zcode-login-conflict');
      // Credentials must not leave recoverable copies after logout. API
      // configuration retains the normal archive; credentials do not.
      const temporary = path.join(path.dirname(this.credentialsPath), `.credentials-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
        await rename(temporary, this.credentialsPath);
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      }
    });
    if (process.platform !== 'win32') await chmod(this.credentialsPath, 0o600);
  }

  private run(args: string[], operationRoot: string, signal: AbortSignal, progress?: (value: ZCodeLoginProgress) => void): Promise<Record<string, unknown>> {
    const launch = this.options.getLaunch();
    return new Promise((resolve, reject) => {
      let stdout = '', stderr = '', settled = false, expired = false, lastUrl = '';
      const child = (this.options.spawnImpl ?? spawn)(launch.command, [...launch.args.slice(0, -2), ...args], {
        cwd: operationRoot, windowsHide: true, stdio: 'pipe',
        env: { ...process.env, ...launch.extraEnv, ...this.getEnvironment(), ZCODE_DATA_BASE_DIR: operationRoot,
          ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: path.join(operationRoot, '.zcode', 'v2', 'provider_config.json') },
      });
      const kill = () => { child.kill(); };
      const timer = setTimeout(() => { expired = true; kill(); }, this.options.timeoutMs ?? 300_000);
      signal.addEventListener('abort', kill, { once: true });
      const finish = (error?: Error, result?: Record<string, unknown>) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal.removeEventListener('abort', kill);
        if (error) reject(error); else resolve(result ?? {});
      };
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
        if (stdout.length > 1_048_576) { kill(); finish(new Error('zcode-login-response-invalid')); }
      });
      child.stderr.on('data', (data: Buffer) => {
        stderr = (stderr + data.toString('utf8')).slice(-16_384);
        const match = /https:\/\/[^\s<>"']+/.exec(stderr);
        if (match && progress && !signal.aborted) {
          const url = new URL(match[0]);
          if (!url.username && !url.password && url.href !== lastUrl) { lastUrl = url.href; progress({ authorizeUrl: url.href }); }
        }
      });
      child.once('error', () => finish(new Error('zcode-login-runtime-unavailable')));
      child.once('close', (code) => {
        if (signal.aborted || expired) return finish(new Error(expired ? 'zcode-login-timeout' : 'zcode-login-cancelled'));
        if (code !== 0) return finish(new Error(/unknown|usage|not.*support/i.test(stderr) ? 'zcode-login-upgrade-required' : 'zcode-login-failed'));
        try { finish(undefined, zcodeRecord(JSON.parse(stdout))); } catch { finish(new Error('zcode-login-response-invalid')); }
      });
      if (signal.aborted) kill();
    });
  }
}
