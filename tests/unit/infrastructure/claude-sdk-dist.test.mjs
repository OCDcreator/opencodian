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
  it('removes stale Claude Agent SDK runtime packages from dist/node_modules', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-claude-sdk-dist-'));
    const distDir = path.join(tempRoot, 'dist');
    const anthropicDir = path.join(distDir, 'node_modules', '@anthropic-ai');
    const stalePackages = [
      '@anthropic-ai/claude-agent-sdk',
      '@anthropic-ai/claude-agent-sdk-darwin-arm64',
      '@anthropic-ai/claude-agent-sdk-linux-x64',
    ];

    for (const packageName of stalePackages) {
      const packageDir = path.join(distDir, 'node_modules', ...packageName.split('/'));
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: packageName }));
    }
    const unrelatedPackage = path.join(anthropicDir, 'not-claude-agent-sdk');
    fs.mkdirSync(unrelatedPackage, { recursive: true });

    const removed = callExport('pruneClaudeAgentSdkRuntimeArtifacts', tempRoot, distDir);

    expect(removed).toEqual(expect.arrayContaining(stalePackages.map((packageName) =>
      path.join(distDir, 'node_modules', ...packageName.split('/')),
    )));
    for (const packageName of stalePackages) {
      expect(fs.existsSync(path.join(distDir, 'node_modules', ...packageName.split('/')))).toBe(false);
    }
    expect(fs.existsSync(unrelatedPackage)).toBe(true);
  });
});
