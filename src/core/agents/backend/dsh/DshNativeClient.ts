import { prepareDshManagedLaunch, releaseDshLaunchScope } from '../configuration/DshManagedProfile';
import { DshAcpClient, type DshAcpClientOptions, type DshJsonObject } from './DshAcpClient';

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
    await prepareDshManagedLaunch(this.nativeOptions,
      { command: this.baseCommand, args: this.baseArgs, env: this.nativeOptions.launch.env },
      'sdk', (scope) => { this.scope = scope; });
  }

  // Native preparation already applies defaults; never wrap it again in an ACP profile.
  protected override async prepareConfigurationLaunch(): Promise<void> {}

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
    // Durable profiles are deliberately absent from the private launch-file lifecycle.
    await releaseDshLaunchScope(scope);
    this.scope = null;
    if (failure) throw failure;
  }

  nativeRequest(method: string, params: DshJsonObject, timeoutMs?: number): Promise<DshJsonObject> {
    return this.requestObject(method, params, timeoutMs);
  }
}
