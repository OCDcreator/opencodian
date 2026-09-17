import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { PiMcpConfigService } from '../../../../../../src/core/agents/backend/pi/PiMcpConfigService';

describe('Pi MCP config reader', () => {
  let home: string;
  let vault: string;
  const service = new PiMcpConfigService();
  const piGlobal = () => path.join(home, '.pi', 'agent', 'mcp.json');
  const projectStandard = () => path.join(vault, '.mcp.json');
  const projectPi = () => path.join(vault, '.pi', 'mcp.json');

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(tmpdir(), 'pi-mcp-home-'));
    vault = await fs.mkdtemp(path.join(tmpdir(), 'pi-mcp-vault-'));
    await fs.mkdir(path.join(home, '.pi', 'agent'), { recursive: true });
    await fs.mkdir(path.join(vault, '.pi'), { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('merges Pi global with project files, letting the project win', async () => {
    await fs.writeFile(piGlobal(), JSON.stringify({
      mcpServers: {
        'zhipu-web-search': { command: 'npx', args: ['-y', 'zhipu-mcp'] },
        shared: { command: 'node', args: ['/srv/shared.js'] },
      },
    }));
    await fs.writeFile(projectStandard(), JSON.stringify({
      mcpServers: { shared: { command: 'node', args: ['/vault/shared.js'] }, 'vault-only': { url: 'https://mcp.example.com/sse' } },
    }));
    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers.map((server) => server.name)).toEqual(['shared', 'vault-only', 'zhipu-web-search']);
    const shared = snapshot.servers.find((server) => server.name === 'shared');
    expect(shared?.endpoint).toBe('node /vault/shared.js');
    expect(shared?.source).toBe(projectStandard());
    expect(snapshot.servers.find((server) => server.name === 'vault-only')?.transport).toBe('http');
    expect(snapshot.sources).toEqual([piGlobal(), projectStandard()]);
  });

  it('never exposes token values or URL secrets', async () => {
    await fs.writeFile(piGlobal(), JSON.stringify({
      mcpServers: {
        http: { url: 'https://mcp.example.com/mcp?key=super-secret#frag', auth: 'bearer', bearerTokenEnv: 'MCP_TOKEN' },
        stdio: { command: 'npx', args: ['-y', 'pkg', '--token', 'plain-secret'] },
        oauth: { url: 'https://oauth.example.com/sse', auth: 'oauth' },
      },
    }));
    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    const http = snapshot.servers.find((server) => server.name === 'http');
    expect(http?.endpoint).toBe('https://mcp.example.com/mcp');
    expect(http?.auth).toBe('bearer');
    expect(JSON.stringify(snapshot)).not.toContain('super-secret');
    const stdio = snapshot.servers.find((server) => server.name === 'stdio');
    expect(stdio?.endpoint).toBe('npx -y pkg --token ***');
    expect(JSON.stringify(snapshot)).not.toContain('plain-secret');
    expect(snapshot.servers.find((server) => server.name === 'oauth')?.auth).toBe('oauth');
  });

  it('marks disabled servers and reads Pi JSONC configs', async () => {
    await fs.writeFile(piGlobal(), `{
      // comments and trailing commas are allowed by Pi's own parser
      "mcpServers": { "lean-ctx": { "command": "lean-ctx", "disabled": true }, },
    }`);
    await fs.writeFile(projectPi(), JSON.stringify({ mcpServers: { lean: { command: 'lean' } } }));
    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers.find((server) => server.name === 'lean-ctx')?.disabled).toBe(true);
    expect(snapshot.sources).toEqual([piGlobal(), projectPi()]);
  });

  it('ignores unreadable project files and empty declarations', async () => {
    await fs.writeFile(projectStandard(), '{ this is not json');
    await fs.writeFile(projectPi(), JSON.stringify({ imports: [] }));
    const snapshot = service.read({ workingDirectory: vault, homeDir: home, env: {} });

    expect(snapshot.servers).toEqual([]);
    expect(snapshot.sources).toEqual([projectPi()]);
  });

  it('honours exclusive mode and PI_CODING_AGENT_DIR', async () => {
    const customAgent = path.join(home, 'custom-agent');
    await fs.mkdir(customAgent, { recursive: true });
    await fs.writeFile(path.join(customAgent, 'mcp.json'), JSON.stringify({ mcpServers: { custom: { command: 'custom' } } }));
    await fs.writeFile(projectStandard(), JSON.stringify({ mcpServers: { project: { command: 'project' } } }));

    const exclusive = service.read({
      workingDirectory: vault,
      homeDir: home,
      env: { PI_MCP_CONFIG_MODE: 'exclusive', PI_CODING_AGENT_DIR: customAgent },
    });
    expect(exclusive.exclusive).toBe(true);
    expect(exclusive.servers.map((server) => server.name)).toEqual(['custom']);
    expect(exclusive.sources).toEqual([path.join(customAgent, 'mcp.json')]);

    const merged = service.read({ workingDirectory: vault, homeDir: home, env: { PI_CODING_AGENT_DIR: customAgent } });
    expect(merged.exclusive).toBe(false);
    expect(merged.servers.map((server) => server.name)).toEqual(['custom', 'project']);
  });
});
