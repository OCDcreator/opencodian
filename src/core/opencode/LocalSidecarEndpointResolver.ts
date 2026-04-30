import {
  OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST,
  OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT,
} from '../types/settings';
import type { ManagedServerState, OpenCodeServerConfig, ServerDiagnostics } from './types';

export interface ExistingServerProcessInfo {
  pid: number | null;
  commandLine: string | null;
  looksLikeOpenCodeServe: boolean;
  looksLikePluginManagedSidecar: boolean;
}

export interface SidecarCommandClassification {
  looksLikeOpenCodeServe: boolean;
  looksLikePluginManagedSidecar: boolean;
}

export type OccupiedLocalEndpointResolution =
  | { action: 'adopt-managed' }
  | { action: 'restart-managed' }
  | { action: 'recycle-orphan'; existingServer: ExistingServerProcessInfo }
  | {
      action: 'conflict';
      existingServer: ExistingServerProcessInfo;
      diagnostics: ServerDiagnostics;
    };

export type ManagedServerAdoptionOutcome = 'adopted' | 'restart' | 'skip';

export interface LocalSidecarEndpointResolverRuntime {
  tryAdoptManagedServer: () => Promise<ManagedServerAdoptionOutcome>;
  inspectExistingHealthyServer: () => Promise<ExistingServerProcessInfo>;
  getManagedServerState: () => ManagedServerState | null;
}

export class LocalSidecarEndpointResolver {
  constructor(private readonly config: OpenCodeServerConfig) {}

  async resolveOccupiedHealthyLocalEndpoint(
    runtime: LocalSidecarEndpointResolverRuntime,
  ): Promise<OccupiedLocalEndpointResolution> {
    const adoption = await runtime.tryAdoptManagedServer();
    if (adoption === 'adopted') {
      return { action: 'adopt-managed' };
    }

    if (adoption === 'restart') {
      return { action: 'restart-managed' };
    }

    const existingServer = await runtime.inspectExistingHealthyServer();
    if (await this.shouldRecycleUnknownLocalServer(existingServer, runtime.getManagedServerState())) {
      return {
        action: 'recycle-orphan',
        existingServer,
      };
    }

    return {
      action: 'conflict',
      existingServer,
      diagnostics: this.buildHealthyLocalConflictDiagnostics(existingServer),
    };
  }

  classifyCommandLine(commandLine: string | null): SidecarCommandClassification {
    const looksLikeOpenCodeServe = this.looksLikeOpenCodeServeCommand(commandLine);
    return {
      looksLikeOpenCodeServe,
      looksLikePluginManagedSidecar: looksLikeOpenCodeServe && this.looksLikePluginManagedSidecarCommand(commandLine),
    };
  }

  looksLikeOpenCodeServeCommand(commandLine: string | null): boolean {
    if (!commandLine) {
      return false;
    }

    const normalizedCommand = commandLine.toLowerCase();
    const host = this.config.local.host.toLowerCase();
    return normalizedCommand.includes('opencode')
      && normalizedCommand.includes(' serve')
      && (
        normalizedCommand.includes(`--port ${this.config.local.port}`)
        || normalizedCommand.includes(`--port=${this.config.local.port}`)
      )
      && (
        normalizedCommand.includes(`--hostname ${host}`)
        || normalizedCommand.includes(`--hostname=${host}`)
      );
  }

  looksLikePluginManagedSidecarCommand(commandLine: string | null): boolean {
    if (!this.looksLikeOpenCodeServeCommand(commandLine)) {
      return false;
    }

    const normalizedCommand = commandLine?.toLowerCase() ?? '';
    return (
      normalizedCommand.includes('--cors app://obsidian.md')
      && normalizedCommand.includes('--cors app://obsidian')
    );
  }

  async shouldRecycleUnknownLocalServer(
    existingServer: ExistingServerProcessInfo,
    managedServerState: ManagedServerState | null,
  ): Promise<boolean> {
    if (managedServerState) {
      return false;
    }

    if (!this.isDefaultManagedLocalEndpoint()) {
      return false;
    }

    return existingServer.pid !== null
      && (
        existingServer.looksLikePluginManagedSidecar
        || this.looksLikePluginManagedSidecarCommand(existingServer.commandLine)
      );
  }

  buildOrphanRestartDiagnostics(existingServer: ExistingServerProcessInfo): ServerDiagnostics {
    return {
      reason: 'local-orphan-restarted',
      host: this.config.local.host,
      port: this.config.local.port,
      pid: existingServer.pid ?? undefined,
      commandLine: existingServer.commandLine ?? undefined,
      message: 'Detected and restarted an orphaned plugin sidecar.',
    };
  }

  buildHealthyLocalConflictDiagnostics(existingServer: ExistingServerProcessInfo): ServerDiagnostics {
    return {
      reason: 'local-conflict',
      host: this.config.local.host,
      port: this.config.local.port,
      pid: existingServer.pid ?? undefined,
      commandLine: existingServer.commandLine ?? undefined,
      message: 'Another healthy OpenCode server already occupies the configured local endpoint.',
    };
  }

  buildConflictMessage(existingServer: ExistingServerProcessInfo, healthy: boolean): string {
    const endpoint = `${this.config.local.host}:${this.config.local.port}`;
    const pidLabel = existingServer.pid ? ` (PID ${existingServer.pid})` : '';
    if (!healthy) {
      return `Local endpoint ${endpoint} is already in use by another process${pidLabel}.`;
    }

    if (existingServer.looksLikeOpenCodeServe) {
      return `Another OpenCode server already occupies local endpoint ${endpoint}${pidLabel}. Configure a different plugin port or stop the conflicting process.`;
    }

    return `A healthy server already occupies local endpoint ${endpoint}${pidLabel}. Configure a different plugin port or stop the conflicting process.`;
  }

  private isDefaultManagedLocalEndpoint(): boolean {
    return this.config.local.host === OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST
      && this.config.local.port === OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT;
  }
}
