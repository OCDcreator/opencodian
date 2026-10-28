import { realpathSync } from 'node:fs';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { DshAcpClient, type DshAcpClientOptions, type DshJsonObject } from './DshAcpClient';

declare const DSH_NATIVE_SERVICE_SOURCE: string;

/** Owns a per-launch Harness extension; the installed application and user profiles stay intact. */
export class DshNativeClient extends DshAcpClient {
  private scope: string | null = null;
  private preparing: Promise<void> | null = null;
  private nativeStopping: Promise<void> | null = null;
  private nativeGeneration = 0;
  private readonly baseArgs: string[];
  private readonly baseCommand: string;

  constructor(private readonly nativeOptions: DshAcpClientOptions) {
    super(nativeOptions);
    this.baseArgs = [...nativeOptions.launch.args];
    this.baseCommand = nativeOptions.launch.command;
  }

  override async start(): Promise<void> {
    if (this.nativeStopping) await this.nativeStopping;
    const generation = this.nativeGeneration;
    try {
      if (!this.scope || this.preparing) {
        this.preparing ??= this.prepare();
        try { await this.preparing; } finally { this.preparing = null; }
      }
      if (generation !== this.nativeGeneration) throw new Error('Harness native start was cancelled');
      await super.start();
      if (this.handshake?.nativeProtocol !== 'opencodian.dsh-native/1')
        throw new Error('The installed Harness did not load the OpenCodian native extension');
    } catch (error) { await this.stop(); throw error; }
  }

  private async prepare(): Promise<void> {
    const args = [...this.baseArgs];
    const profile = args.indexOf('--profile');
    if (profile < 0) throw new Error('Harness launcher is missing its profile argument');
    const nativeAnchor = profile > 0 ? args[0] : realpathSync(this.baseCommand);
    const scope = await mkdtemp(path.join(os.tmpdir(), 'opencodian-dsh-'));
    this.scope = scope;
    const service = path.join(scope, 'service.mjs');
    const patch = path.join(scope, 'native.patch.yml');
    const launcher = path.join(scope, 'launcher.mjs');
    await writeFile(service, DSH_NATIVE_SERVICE_SOURCE, { mode: 0o600 });
    await writeFile(patch, `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n    - id: opencodian-native\n      name: ${JSON.stringify(service)}\n      inject: [sdkAppStartup, loader]\n      config:\n        nativeAnchor: ${JSON.stringify(nativeAnchor)}\n`, { mode: 0o600 });
    await writeFile(launcher, `import { launchNativeRuntime } from './service.mjs';\nawait launchNativeRuntime(${JSON.stringify({ nativeAnchor, scope, args: args.slice(profile + 2) })});\n`, { mode: 0o600 });
    // npm CLIs run under the external Node on PATH. In Obsidian,
    // process.execPath is the embedding Electron app and cannot host this CLI.
    this.nativeOptions.launch.command = profile > 0 ? this.baseCommand : 'node';
    this.nativeOptions.launch.env.ELECTRON_RUN_AS_NODE = '1';
    this.nativeOptions.launch.args.splice(0, this.nativeOptions.launch.args.length, launcher);
  }

  override async stop(): Promise<void> {
    ++this.nativeGeneration;
    if (this.nativeStopping) return this.nativeStopping;
    const stopping = this.stopNative(); this.nativeStopping = stopping;
    try { await stopping; } finally { if (this.nativeStopping === stopping) this.nativeStopping = null; }
  }

  private async stopNative(): Promise<void> {
    await this.preparing?.catch(() => undefined);
    let failure: unknown;
    try { await super.stop(); } catch (error) { failure = error; }
    const scope = this.scope;
    if (!scope) { if (failure) throw failure; return; }
    // Only explicit files in this launch's private profile may be removed.
    for (const file of ['service.mjs', 'native.patch.yml', 'launcher.mjs', 'package.json', 'compatibility.json', 'cordis.yml', 'node_modules']) {
      await unlink(path.join(scope, file)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
    await rmdir(scope);
    this.scope = null;
    if (failure) throw failure;
  }

  nativeRequest(method: string, params: DshJsonObject, timeoutMs?: number): Promise<DshJsonObject> {
    return this.requestObject(method, params, timeoutMs);
  }
}
