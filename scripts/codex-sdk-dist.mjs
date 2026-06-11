/**
 * codex-sdk-dist.mjs — copies Codex CLI runtime packages to dist/.
 *
 * The @openai/codex-sdk is bundled into main.js by esbuild, but the SDK's
 * findCodexPath() resolves @openai/codex/package.json and then the platform
 * package (e.g. @openai/codex-darwin-arm64) at runtime to locate the CLI
 * binary. These must be available as real node_modules directories next to
 * the bundled plugin output.
 *
 * Modeled after claude-sdk-dist.mjs.
 */
import fs from 'fs';
import path from 'path';
import process from 'process';

export const CODEX_NPM_PACKAGE = '@openai/codex';

/**
 * Map platform-arch to the @openai/codex platform package name.
 * Mirrors the PLATFORM_PACKAGE_BY_TARGET map in the SDK source.
 */
export function getCodexPlatformPackage(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const packages = {
    'darwin-arm64': '@openai/codex-darwin-arm64',
    'darwin-x64': '@openai/codex-darwin-x64',
    'linux-arm64': '@openai/codex-linux-arm64',
    'linux-x64': '@openai/codex-linux-x64',
    'win32-arm64': '@openai/codex-win32-arm64',
    'win32-x64': '@openai/codex-win32-x64',
  };
  return packages[key] ?? null;
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

/**
 * Copy Codex CLI runtime packages to dist/node_modules/.
 *
 * Copies:
 * 1. @openai/codex — main package (package.json + bin/codex.js)
 * 2. @openai/codex-<platform>-<arch> — platform binary package (vendor/...)
 *
 * @returns {string[]} List of copied destination paths.
 */
export function copyCodexRuntime(root = process.cwd(), distDir = path.join(root, 'dist')) {
  // Clean previous Codex runtime copies
  fs.rmSync(path.join(distDir, 'node_modules', ...CODEX_NPM_PACKAGE.split('/')), {
    recursive: true,
    force: true,
  });

  const copied = [];
  const platformPackage = getCodexPlatformPackage();
  if (!platformPackage) {
    throw new Error(`Unsupported Codex platform: ${process.platform}-${process.arch}`);
  }

  // Copy main @openai/codex package (package.json + bin/codex.js)
  copied.push(copyPackage(root, distDir, CODEX_NPM_PACKAGE));

  // Copy platform binary package (vendor/<triple>/bin/codex)
  copied.push(copyPackage(root, distDir, platformPackage));

  // Copy ws package so the runtime app-server client can use Node WebSockets
  // inside Obsidian's renderer process (the browser WebSocket is blocked for
  // localhost connections in the plugin sandbox).
  copied.push(copyPackage(root, distDir, 'ws'));

  return copied;
}
