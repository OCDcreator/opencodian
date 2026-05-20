const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'claude-sdk-dist.mjs');

function callExport(exportName, ...args) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const modulePath = ${JSON.stringify(modulePath)};
    const mod = await import(pathToFileURL(modulePath).href);
    const result = mod[${JSON.stringify(exportName)}](...${JSON.stringify(args)});
    process.stdout.write(JSON.stringify(result));
  `;

  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });

  return JSON.parse(output);
}

describe('claude-sdk-dist', () => {
  it('maps supported Node platforms to Claude Agent SDK optional binary packages', () => {
    expect(callExport('getClaudeAgentSdkPlatformPackage', 'darwin', 'arm64')).toBe('@anthropic-ai/claude-agent-sdk-darwin-arm64');
    expect(callExport('getClaudeAgentSdkPlatformPackage', 'darwin', 'x64')).toBe('@anthropic-ai/claude-agent-sdk-darwin-x64');
    expect(callExport('getClaudeAgentSdkPlatformPackage', 'linux', 'x64')).toBe('@anthropic-ai/claude-agent-sdk-linux-x64');
    expect(callExport('getClaudeAgentSdkPlatformPackage', 'linux', 'arm64')).toBe('@anthropic-ai/claude-agent-sdk-linux-arm64');
    expect(callExport('getClaudeAgentSdkPlatformPackage', 'win32', 'x64')).toBe('@anthropic-ai/claude-agent-sdk-win32-x64');
    expect(callExport('getClaudeAgentSdkPlatformPackage', 'win32', 'arm64')).toBe('@anthropic-ai/claude-agent-sdk-win32-arm64');
    expect(callExport('getClaudeAgentSdkPlatformPackage', 'freebsd', 'x64')).toBeNull();
  });

  it('maps platform-specific Claude Code binary names', () => {
    expect(callExport('getClaudeAgentSdkBinaryName', 'darwin')).toBe('claude');
    expect(callExport('getClaudeAgentSdkBinaryName', 'linux')).toBe('claude');
    expect(callExport('getClaudeAgentSdkBinaryName', 'win32')).toBe('claude.exe');
  });

  it('copies the current platform binary into dist/node_modules', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-claude-sdk-dist-'));
    const distDir = path.join(tempRoot, 'dist');
    const platformPackage = callExport('getClaudeAgentSdkPlatformPackage');
    expect(platformPackage).toBeTruthy();

    for (const packageName of [platformPackage]) {
      const packageDir = path.join(tempRoot, 'node_modules', ...packageName.split('/'));
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: packageName }));
    }

    const copied = callExport('copyClaudeAgentSdkRuntime', tempRoot, distDir);

    expect(copied).toHaveLength(1);
    expect(fs.existsSync(path.join(distDir, 'node_modules', ...platformPackage.split('/'), 'package.json'))).toBe(true);
  });
});
