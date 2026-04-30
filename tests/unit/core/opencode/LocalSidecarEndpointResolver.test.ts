import { LocalSidecarEndpointResolver } from '../../../../src/core/opencode/LocalSidecarEndpointResolver';
import type { OpenCodeServerConfig } from '../../../../src/core/opencode/types';

const defaultConfig: OpenCodeServerConfig = {
  mode: 'local',
  baseUrl: 'http://127.0.0.1:4196',
  local: {
    host: '127.0.0.1',
    port: 4196,
    autoStart: true,
  },
  auth: {
    type: 'none',
    username: 'opencode',
    password: '',
    token: '',
  },
  modelSourceMode: 'merge',
  pluginIsolationMode: 'default',
};

describe('LocalSidecarEndpointResolver', () => {
  it('classifies plugin-managed OpenCode serve commands on the configured endpoint', () => {
    const resolver = new LocalSidecarEndpointResolver(defaultConfig);

    const result = resolver.classifyCommandLine(
      'opencode serve --port 4196 --hostname 127.0.0.1 --cors app://obsidian.md --cors app://obsidian',
    );

    expect(result).toEqual({
      looksLikeOpenCodeServe: true,
      looksLikePluginManagedSidecar: true,
    });
  });

  it('builds conflict diagnostics and message for healthy occupied OpenCode endpoints', () => {
    const resolver = new LocalSidecarEndpointResolver(defaultConfig);
    const existingServer = {
      pid: 2222,
      commandLine: 'opencode serve --port=4196 --hostname=127.0.0.1',
      ...resolver.classifyCommandLine('opencode serve --port=4196 --hostname=127.0.0.1'),
    };

    expect(resolver.buildHealthyLocalConflictDiagnostics(existingServer)).toEqual({
      reason: 'local-conflict',
      host: '127.0.0.1',
      port: 4196,
      pid: 2222,
      commandLine: 'opencode serve --port=4196 --hostname=127.0.0.1',
      message: 'Another healthy OpenCode server already occupies the configured local endpoint.',
    });
    expect(resolver.buildConflictMessage(existingServer, true)).toBe(
      'Another OpenCode server already occupies local endpoint 127.0.0.1:4196 (PID 2222). Configure a different plugin port or stop the conflicting process.',
    );
  });

  it('only recycles plugin-managed sidecars on the default endpoint without persisted state', async () => {
    const resolver = new LocalSidecarEndpointResolver(defaultConfig);
    const pluginManaged = {
      pid: 3333,
      commandLine: 'opencode serve --port 4196 --hostname 127.0.0.1 --cors app://obsidian.md --cors app://obsidian',
      looksLikeOpenCodeServe: true,
      looksLikePluginManagedSidecar: true,
    };

    await expect(resolver.shouldRecycleUnknownLocalServer(pluginManaged, null)).resolves.toBe(true);
    await expect(resolver.shouldRecycleUnknownLocalServer(pluginManaged, {
      pid: 3333,
      host: '127.0.0.1',
      port: 4196,
    })).resolves.toBe(false);
  });
});
