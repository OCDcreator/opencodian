import { randomBytes } from 'node:crypto';
import nodeFs from 'node:fs';
import * as path from 'node:path';

import { type App, Setting } from 'obsidian';

import { PiMcpConfigService } from '../../../../../../src/core/agents/backend/pi/PiMcpConfigService';
import { SettingsPiSection } from '../../../../../../src/features/settings/SettingsPiSection';
import { setLocale } from '../../../../../../src/i18n';

const SENSITIVE_FLAGS = ['--token', '-token', '--api-key', '--client_secret', '--PASSWORD', '--credentials', '--authorization'];

describe('Pi MCP endpoint redaction', () => {
  const home = path.resolve('.tmp/pi-mcp-t04/home');
  const vault = path.resolve('.tmp/pi-mcp-t04/vault');
  const configPath = path.join(home, '.pi', 'agent', 'mcp.json');
  const service = new PiMcpConfigService();
  let servers: Record<string, unknown>;
  let configText: string | undefined;
  let readError: Error | undefined;
  let secret: string;

  beforeEach(() => {
    // Hex cannot contain any of the redaction keywords; each case gets a fresh fake credential.
    secret = randomBytes(16).toString('hex');
    servers = {};
    configText = undefined;
    readError = undefined;
    document.body.innerHTML = '';
    setLocale('zh');
    const originalRead = nodeFs.readFileSync;
    jest.spyOn(nodeFs, 'readFileSync').mockImplementation(((...args: Parameters<typeof nodeFs.readFileSync>) => {
      if (args[0] === configPath) {
        if (readError) throw readError;
        return configText ?? JSON.stringify({ mcpServers: servers });
      }
      return originalRead(...args);
    }) as typeof nodeFs.readFileSync);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(SENSITIVE_FLAGS)('redacts the independent value of %s while keeping safe diagnostics', (flag) => {
    servers = { local: { command: 'npx', args: ['-y', 'pkg', flag, secret, '--port', '4096', '--verbose'] } };

    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers[0].endpoint).toBe(`npx -y pkg ${flag} *** --port 4096 --verbose`);
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it.each(SENSITIVE_FLAGS)('redacts the inline value of %s and keeps its flag name', (flag) => {
    servers = { local: { command: 'node', args: ['server.js', `${flag}=${secret}=suffix`, '--port=4096'] } };

    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers[0].endpoint).toBe(`node server.js ${flag}=*** --port=4096`);
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it('redacts sensitive values even when they look like a flag or are separated by a non-string entry', () => {
    servers = {
      flagLike: { command: 'node', args: ['--token', `--${secret}`, '--port', '4096'] },
      mixed: { command: 'node', args: ['--password', null, secret, '--transport', 'stdio'] },
    };

    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers.map(server => server.endpoint)).toEqual([
      'node --token *** --port 4096',
      'node --password *** --transport stdio',
    ]);
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it('keeps safe arguments and handles empty or missing sensitive values without consuming later diagnostics', () => {
    servers = {
      inline: { command: 'node', args: ['server.js', '--token=', '--port', '4096', '--transport=stdio'] },
      missing: { command: 'node', args: ['server.js', '--token'] },
      empty: { command: 'node', args: ['--token', '', '--verbose'] },
      safe: { command: 'npx', args: ['-y', 'pkg', '--port', '4096', '--transport=stdio', '--verbose'] },
    };

    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers.map(server => server.endpoint)).toEqual([
      'node --token *** --verbose',
      'node server.js --token=*** --port 4096 --transport=stdio',
      'node server.js --token',
      'npx -y pkg --port 4096 --transport=stdio --verbose',
    ]);
  });

  it.each([
    'https://%s:%s@mcp.example.com:8443/sse?nonce=%s#%s',
    'https://%s@mcp.example.com:8443/sse?nonce=%s#%s',
    'https://:%s@mcp.example.com:8443/sse?nonce=%s#%s',
    'https://%61%s:p%%40%s@mcp.example.com:8443/sse?nonce=%s#%s',
  ])('removes userinfo, query and fragment from %s', (template) => {
    const url = template.replace(/%s/g, secret).replace('%%', '%');
    servers = { remote: { url, disabled: true, auth: 'bearer', bearerToken: secret, headers: { Authorization: secret }, env: { MCP_TOKEN: secret } } };

    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers[0]).toEqual({
      name: 'remote', transport: 'http', endpoint: 'https://mcp.example.com:8443/sse',
      disabled: true, auth: 'bearer', source: configPath,
    });
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(nodeFs.readFileSync(configPath, 'utf8')).toContain(url);
  });

  it.each([
    'https://%s:%s@mcp.example.com:invalid/sse?nonce=%s#%s',
    'https://%s:%s@[broken/sse?nonce=%s#%s',
    'https://%s:%s@/sse?nonce=%s#%s',
    '//%s:%s@mcp.example.com/sse?nonce=%s#%s',
  ])('fails closed for malformed URLs instead of returning raw credentials: %s', (template) => {
    servers = { broken: { url: template.replace(/%s/g, secret) } };
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers[0].endpoint).toBe('[invalid URL]');
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('sanitizes HTTP URL positional and inline arguments while keeping their host and path', () => {
    const url = `https://${secret}:${secret}@mcp.example.com:8443/sse?nonce=${secret}#${secret}`;
    servers = { local: { command: 'node', args: ['server.js', '--url', url, `--endpoint=${url}`, '--verbose'] } };

    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers[0].endpoint).toBe('node server.js --url https://mcp.example.com:8443/sse --endpoint=https://mcp.example.com:8443/sse --verbose');
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it('keeps keyword-based positional redaction for values without a flag', () => {
    servers = { local: { command: 'node', args: [`Authorization: Bearer ${secret}`, `password=${secret}`, 'server.js'] } };

    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers[0].endpoint).toBe('node *** *** server.js');
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it('never echoes credentials from file-read errors or malformed JSONC to a snapshot or console', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    readError = new Error(`Cannot open https://${secret}:${secret}@mcp.example.com/sse`);

    expect(service.read({ workingDirectory: vault, homeDir: home, env: {} })).toEqual({ servers: [], sources: [], exclusive: false });

    readError = undefined;
    configText = `{"mcpServers":{"broken":{"command":"node","args":["--token","${secret}"]}}`;
    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot).toEqual({ servers: [], sources: [], exclusive: false });
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('passes only redacted endpoints into real Pi settings descriptions and serialized reports', () => {
    const url = `https://${secret}:${secret}@mcp.example.com:8443/sse?nonce=${secret}#${secret}`;
    servers = {
      http: { url, auth: 'oauth' },
      invalid: { url: `https://${secret}:${secret}@mcp.example.com:invalid/sse` },
      stdio: { command: 'node', args: ['server.js', '--token', secret, `--api-key=${secret}`, '--port', '4096'] },
    };
    const read = service.read.bind(service);
    jest.spyOn(service, 'read').mockImplementation(options => read({ ...options, homeDir: home, env: {} }));
    const descriptions = jest.spyOn(Setting.prototype, 'setDesc');
    const container = document.body.createDiv();
    const host = {
      app: { vault: { adapter: { basePath: vault } } } as unknown as App,
      settings: { backendSettings: {} },
      saveSettings: async () => {},
    };

    new SettingsPiSection(host, service).attachTabbed(container, 'mcp');

    const display = descriptions.mock.calls.map(([description]) => String(description)).join('\n');
    const snapshot = service.read({ workingDirectory: vault });
    const copiedEndpoints = snapshot.servers.map(server => server.endpoint).join('\n');
    expect(display).toContain('https://mcp.example.com:8443/sse');
    expect(display).toContain('[invalid URL]');
    expect(display).toContain('node server.js --token *** --api-key=*** --port 4096');
    expect(display).toContain('OAuth');
    expect(display).toContain('/pi-mcp-t04/home/.pi/agent/mcp.json');
    for (const output of [display, container.textContent, copiedEndpoints, JSON.stringify(snapshot)]) {
      expect(output).not.toContain(secret);
    }
    expect(nodeFs.readFileSync(configPath, 'utf8')).toContain(secret);
  });
});
