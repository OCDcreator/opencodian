import fs from 'fs';
import path from 'path';
import process from 'process';

export const CLAUDE_AGENT_SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk';

export function getClaudeAgentSdkPlatformPackage(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const packages = {
    'darwin-arm64': '@anthropic-ai/claude-agent-sdk-darwin-arm64',
    'darwin-x64': '@anthropic-ai/claude-agent-sdk-darwin-x64',
    'linux-arm64': '@anthropic-ai/claude-agent-sdk-linux-arm64',
    'linux-x64': '@anthropic-ai/claude-agent-sdk-linux-x64',
    'win32-arm64': '@anthropic-ai/claude-agent-sdk-win32-arm64',
    'win32-x64': '@anthropic-ai/claude-agent-sdk-win32-x64',
  };
  return packages[key] ?? null;
}

export function getClaudeAgentSdkBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'claude.exe' : 'claude';
}

function packagePath(root, packageName) {
  return path.join(root, 'node_modules', ...packageName.split('/'));
}

function copyPackage(root, distDir, packageName) {
  const sourcePath = packagePath(root, packageName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Cannot package ${packageName}: ${sourcePath} does not exist`);
  }

  const destinationPath = path.join(distDir, 'node_modules', ...packageName.split('/'));
  fs.rmSync(destinationPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
  return destinationPath;
}

export function copyClaudeAgentSdkRuntime(root = process.cwd(), distDir = path.join(root, 'dist')) {
  fs.rmSync(path.join(distDir, 'node_modules', ...CLAUDE_AGENT_SDK_PACKAGE.split('/')), {
    recursive: true,
    force: true,
  });
  const copied = [];
  const platformPackage = getClaudeAgentSdkPlatformPackage();
  if (!platformPackage) {
    throw new Error(`Unsupported Claude Agent SDK platform: ${process.platform}-${process.arch}`);
  }
  copied.push(copyPackage(root, distDir, platformPackage));
  return copied;
}
