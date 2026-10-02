#!/usr/bin/env node
/** Six-backend real auxiliary-query audit; --preflight / --bundle-only never start a CLI. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
export const AUDIT_BACKENDS = ['opencode', 'opencode2', 'claude-code', 'codex', 'pi', 'zcode'];

export function selectAuditBackends(args) {
  const flags = new Set(['--preflight', '--bundle-only']);
  const unknown = args.filter((arg) => !flags.has(arg) && !AUDIT_BACKENDS.includes(arg));
  if (unknown.length) throw new Error('Unknown backend(s) or option(s): ' + unknown.map(() => '[unsupported]').join(', '));
  if (args.includes('--preflight') && args.includes('--bundle-only')) throw new Error('Choose --preflight or --bundle-only.');
  const selected = args.filter((arg) => AUDIT_BACKENDS.includes(arg));
  return [...new Set(selected.length ? selected : AUDIT_BACKENDS)];
}

/** A Node HTTP bridge only; no backend, model, or safety response is replaced. */
export function auditBundleOptions(backend, outfile) {
  return {
    entryPoints: [path.join(here, backend === 'opencode2' ? 'opencode2-aux-query-audit.entry.ts' : 'aux-query-audit.entry.ts')],
    outfile, bundle: true, platform: 'node', format: 'esm', target: 'node20',
    packages: backend === 'opencode2' ? 'bundle' : 'external',
    sourcemap: 'inline', logLevel: 'silent', absWorkingDir: repoRoot,
    banner: { js: "import { createRequire as auditCreateRequire } from 'node:module'; const require = auditCreateRequire(import.meta.url);" },
    plugins: [{
      name: 'node-obsidian-http',
      setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'audit-http' }));
        build.onLoad({ filter: /.*/, namespace: 'audit-http' }, () => ({ contents: `
          export async function requestUrl(options) {
            const response = await fetch(options.url, options);
            const text = await response.text();
            if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + text);
            return { status: response.status, headers: Object.fromEntries(response.headers), text,
              get json() { return JSON.parse(text); } };
          }
        ` }));
      },
    }],
  };
}

export function auditExitCode(outcomes) {
  if (outcomes.some((outcome) => outcome.status === 'failed')) return 1;
  return outcomes.length && outcomes.every((outcome) => outcome.status === 'passed') ? 0 : 2;
}

/** Missing/malformed child evidence cannot become a pass from an exit code alone. */
export function validateAuditReport(backend, report, code) {
  if (report?.backend !== backend || !['passed', 'failed', 'blocked'].includes(report.status)
    || !['real-model', 'preflight'].includes(report.execution) || typeof report.passed !== 'boolean'
    || report.passed !== (report.status === 'passed') || !Array.isArray(report.checks)
    || !report.checks.length || report.checks.some((check) => !check || typeof check.name !== 'string'
      || !check.name || typeof check.ok !== 'boolean')) {
    return { backend, status: 'failed', passed: false, checks: [], detail: 'Missing or invalid backend audit report.' };
  }
  if (report.status === 'passed' && (code !== 0 || report.execution !== 'real-model'
    || !report.checks?.length || report.checks.some((check) => check.ok !== true))) {
    return { ...report, status: 'failed', passed: false, detail: 'Pass lacks successful real-model checks.' };
  }
  if ((report.status === 'blocked' && code !== 2) || (report.status === 'failed' && code !== 1)) {
    return { ...report, status: 'failed', passed: false, detail: 'Audit report has an inconsistent child exit.' };
  }
  return report;
}

export async function runAuxAudit(args = process.argv.slice(2)) {
  // Validate the entire selection before mkdir, bundling, or any native startup.
  const selected = selectAuditBackends(args);
  const mode = args.includes('--bundle-only') ? 'bundle-only' : args.includes('--preflight') ? 'preflight' : 'real-model';
  const cacheRoot = path.join(repoRoot, 'node_modules', '.cache');
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, 'opencodian-aux-audit-'));
  const outcomes = [];
  try {
    for (const backend of selected) {
      const outFile = path.join(outDir, backend + '.mjs');
      const reportFile = path.join(outDir, backend + '.json');
      try {
        await esbuild.build(auditBundleOptions(backend, outFile));
        if (process.env.AUDIT_SAVE_BUNDLE) {
          const destination = selected.length === 1 ? process.env.AUDIT_SAVE_BUNDLE
            : process.env.AUDIT_SAVE_BUNDLE + '.' + backend + '.mjs';
          fs.copyFileSync(outFile, destination);
        }
        if (mode === 'bundle-only') {
          outcomes.push({ backend, status: 'blocked', passed: false, execution: mode, checks: [],
            bundle: 'compiled', detail: 'Offline bundle only; no native process or model was started.' });
          continue;
        }
        const code = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [outFile, backend], {
            stdio: ['ignore', 'pipe', 'pipe'], cwd: repoRoot, windowsHide: true,
            env: { ...process.env, AUDIT_REPORT_PATH: reportFile, AUDIT_AUX_PREFLIGHT: mode === 'preflight' ? '1' : '0' },
          });
          // Drain without exposing native/model stdout, stderr, prompts or credentials.
          child.stdout.on('data', () => {});
          child.stderr.on('data', () => {});
          child.once('error', reject);
          child.once('exit', (exitCode, signal) => resolve(signal ? 1 : exitCode ?? 1));
        });
        const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;
        outcomes.push(validateAuditReport(backend, report, code));
      } catch (error) {
        outcomes.push({ backend, status: 'failed', passed: false, execution: mode, checks: [],
          detail: 'audit operation failed; raw runtime details withheld' });
      } finally {
        // Only explicit files created by this run. Never recursively remove residue.
        for (const file of [outFile, reportFile]) if (fs.existsSync(file)) fs.unlinkSync(file);
      }
    }
  } finally {
    fs.rmdirSync(outDir);
  }
  const report = { capturedAt: new Date().toISOString(), execution: mode, selected,
    status: outcomes.some((outcome) => outcome.status === 'failed') ? 'failed'
      : outcomes.every((outcome) => outcome.status === 'passed') ? 'passed' : 'blocked', outcomes };
  if (process.env.AUDIT_REPORT_PATH) fs.writeFileSync(process.env.AUDIT_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  // Offline bundle success is a compilation result, never a real-model audit pass.
  return mode === 'bundle-only' && !outcomes.some((outcome) => outcome.status === 'failed') ? 0 : auditExitCode(outcomes);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAuxAudit().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error('audit operation failed; raw runtime details withheld');
    process.exitCode = 1;
  });
}
