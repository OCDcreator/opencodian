#!/usr/bin/env node
/**
 * Auxiliary-query security audit runner.
 *
 * Bundles `scripts/audit/aux-query-audit.entry.ts` with esbuild (bare imports stay
 * external and resolve from node_modules at runtime) and executes it.
 *
 * Usage: node scripts/audit/run-aux-query-audit.mjs [backend ...]
 *   backends: opencode | claude-code | codex | pi   (default: all)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const entry = path.join(here, 'aux-query-audit.entry.ts');

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
  packages: 'external',
  sourcemap: 'inline',
  logLevel: 'warning',
  absWorkingDir: repoRoot,
});

const child = spawn(process.execPath, [outFile, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: repoRoot,
  env: process.env,
});

child.on('exit', (code) => {
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch {
    // Temp cleanup is best effort.
  }
  process.exit(code ?? 1);
});
