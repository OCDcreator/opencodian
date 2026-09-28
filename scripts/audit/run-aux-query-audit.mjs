#!/usr/bin/env node
/**
 * Auxiliary-query security audit runner.
 *
 * Bundles `scripts/audit/aux-query-audit.entry.ts` with esbuild (bare imports stay
 * external and resolve from node_modules at runtime) and executes it.
 *
 * Usage: node scripts/audit/run-aux-query-audit.mjs [backend ...]
 *   backends: opencode | claude-code | codex | pi   (default: all)
 *   OpenCode 2: run separately with `opencode2` and OPENCODE2_BIN.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const isOpenCode2 = process.argv.slice(2).includes('opencode2');
if (isOpenCode2 && process.argv.slice(2).length !== 1) throw new Error('Run the OpenCode 2 audit separately.');
const entry = path.join(here, isOpenCode2 ? 'opencode2-aux-query-audit.entry.ts' : 'aux-query-audit.entry.ts');

// The bundle must sit inside the repository so that Node resolves the bare
// `packages: 'external'` imports (the SDK, `ws`) from node_modules at runtime.
const cacheRoot = path.join(repoRoot, 'node_modules', '.cache');
fs.mkdirSync(cacheRoot, { recursive: true });
const outDir = fs.mkdtempSync(path.join(cacheRoot, 'opencodian-aux-audit-'));
const outFile = path.join(outDir, 'aux-query-audit.mjs');

await esbuild.build({
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: isOpenCode2 ? 'bundle' : 'external',
  sourcemap: 'inline',
  logLevel: 'warning',
  absWorkingDir: repoRoot,
  ...(isOpenCode2 ? { banner: { js: "import { createRequire as auditCreateRequire } from 'node:module'; const require = auditCreateRequire(import.meta.url);" } } : {}),
  plugins: isOpenCode2 ? [{
    name: 'node-obsidian-http',
    setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'audit-http' }));
      build.onLoad({ filter: /.*/, namespace: 'audit-http' }, () => ({ contents: `
        export async function requestUrl(options) {
          const response = await fetch(options.url, options);
          const text = await response.text();
          if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + text);
          return { status: response.status, headers: Object.fromEntries(response.headers), text };
        }
      ` }));
    },
  }] : [],
});

if (isOpenCode2 && process.env.AUDIT_SAVE_BUNDLE) fs.copyFileSync(outFile, process.env.AUDIT_SAVE_BUNDLE);

const child = spawn(process.execPath, [outFile, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: repoRoot,
  env: process.env,
});

child.on('exit', (code) => {
  try {
    fs.unlinkSync(outFile);
    fs.rmdirSync(outDir);
  } catch {
    // Temp cleanup is best effort.
  }
  process.exit(code ?? 1);
});
