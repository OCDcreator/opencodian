#!/usr/bin/env node
/** Build a version-bound acceptance baseline without starting CLIs or models. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const planPath = 'docs/requirements/backend-integration-completion-plan-2026-10-02.md';
const sdkPackages = ['@opencode-ai/sdk', '@opencode/client', '@openai/codex-sdk', '@anthropic-ai/claude-agent-sdk'];
export const profiles = [
  { backend: 'opencode', id: 'local-sdk-v2', sdk: '@opencode-ai/sdk' },
  { backend: 'opencode', id: 'local-legacy-http-sse', sdk: '@opencode-ai/sdk' },
  { backend: 'opencode', id: 'remote', sdk: '@opencode-ai/sdk' },
  { backend: 'opencode2', id: 'local-native', sdk: '@opencode/client' },
  { backend: 'opencode2', id: 'remote', sdk: '@opencode/client' },
  { backend: 'codex', id: 'app-server', sdk: '@openai/codex-sdk' },
  { backend: 'codex', id: 'sdk-fallback', sdk: '@openai/codex-sdk' },
  { backend: 'claude-code', id: 'persistent-new', sdk: '@anthropic-ai/claude-agent-sdk' },
  { backend: 'claude-code', id: 'persistent-resume', sdk: '@anthropic-ai/claude-agent-sdk' },
  { backend: 'claude-code', id: 'non-persistent', sdk: '@anthropic-ai/claude-agent-sdk' },
  { backend: 'pi', id: 'current-sdk', sdk: null },
  { backend: 'pi', id: 'minimum-sdk', sdk: null },
  { backend: 'pi', id: 'legacy-npm-shim', sdk: null },
  { backend: 'zcode', id: 'official', sdk: null },
  { backend: 'zcode', id: 'node-bundle', sdk: null },
  { backend: 'zcode', id: 'patched-bundle', sdk: null },
  { backend: 'zcode', id: 'desktop-task-index', sdk: null },
];

const reviewFeatures = [
  ['opencode2', 'inline-edit.model-override', 'T02', ['S05', 'B11', 'E03', 'E05']],
  ['zcode', 'settings.incremental-save', 'T03', ['S04', 'B11']],
  ['pi', 'mcp.endpoint-redaction', 'T04', ['S08']],
  ['codex', 'catalog.cursor-pagination', 'T05', ['S06', 'B02']],
  ['codex', 'session.mutation-result', 'T05', ['S09']],
  ['pi', 'thinking.available-levels', 'T07', ['I12']],
  ['pi', 'history.entries-since', 'T07', ['I12']],
  ['claude-code', 'mcp.permission-override', 'T08', ['I08', 'E02']],
  ['claude-code', 'output-style.reload', 'T08', ['I09']],
  ['zcode', 'extension.management-readback', 'T09', ['I13']],
  ['opencode', 'events.authoritative-sync', 'T10', ['S10', 'B05', 'B09', 'C10']],
  ['opencode2', 'events.authoritative-sync', 'T10', ['S10', 'B05', 'B09', 'C10']],
  ['codex', 'gateway.oauth-candidate', 'T11', ['I10', 'A03']],
  ['codex', 'mcp.app-ui-candidate', 'T11', ['I10']],
  ...['opencode', 'opencode2', 'codex', 'claude-code', 'pi', 'zcode'].map((backend) =>
    [backend, 'aux.readonly-native-proof', 'T06', ['E01', 'E02', 'E06', 'E07']]),
];

export function parseCases(markdown) {
  const cases = markdown.split(/\r?\n/).flatMap((line) => {
    const match = /^\| ((?:S|B|I|C|E|A|U|P)\d{2}) \| (.*?) \| (.*?) \|$/.exec(line);
    return match ? [{ id: match[1], action: match[2], expectation: match[3] }] : [];
  });
  if (cases.length === 0 || new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error('Acceptance plan contains missing or duplicate case identities.');
  }
  for (const [, , , ids] of reviewFeatures) {
    for (const id of ids) if (!cases.some((item) => item.id === id)) throw new Error(`Missing planned case ${id}.`);
  }
  return cases;
}

export function collectDependencies(lock, readInstalled) {
  return sdkPackages.map((name) => {
    const locked = lock.packages?.[`node_modules/${name}`]?.version ?? null;
    let installed = null;
    try { installed = readInstalled(name)?.version ?? null; } catch { /* Missing package is a failed baseline. */ }
    return { name, locked, installed, status: locked !== null && installed === locked ? 'passed' : 'failed' };
  });
}

export function createAcceptanceLedger(cases, dependencies, platform) {
  const byName = new Map(dependencies.map((item) => [item.name, item]));
  const baselineOk = sdkPackages.every((name) => byName.get(name)?.status === 'passed');
  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      platform,
      sdkVersion: profile.sdk ? byName.get(profile.sdk)?.installed ?? null : null,
      runtimeVersion: null,
      handshake: 'unverified',
      // An installed SDK is not an installed CLI, and no credentials were exercised.
      nativeReadiness: baselineOk ? 'unverified' : 'blocked',
      reason: baselineOk ? 'Native executable, handshake and test account have not been validated.' : 'Lock/install mismatch blocks native acceptance.',
    })),
    features: reviewFeatures.flatMap(([backend, feature, task, caseIds]) => profiles
      .filter((profile) => profile.backend === backend)
      .map((profile) => ({
        backend, profile: profile.id, platform, feature, task, caseIds, contractVersion: 1,
        availability: 'unknown', source: 'unverified', runtimeVersion: null,
        configuration: { persistence: 'pending', application: 'pending', runtime: 'pending' },
        evidence: [],
      }))),
    cases: cases.map((item) => ({
      ...item,
      results: profiles.map(({ backend, id }) => ({ backend, profile: id, platform, status: 'unverified', evidence: [] })),
    })),
    coverage: {
      nativePassed: 0, uiPassed: 0, releasePassed: 0,
      denominator: cases.map((item) => item.id),
      note: 'Baseline collection performs no scenario. L0/L1 regressions and native/UI/release results require separate evidence.',
    },
  };
}

export function buildBaseline(repo = root) {
  const read = (relative) => fs.readFileSync(path.join(repo, relative));
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const lockBytes = read('package-lock.json');
  const planBytes = read(planPath);
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const dependencies = collectDependencies(lock, (name) => JSON.parse(read(`node_modules/${name}/package.json`).toString('utf8')));
  const ledger = createAcceptanceLedger(parseCases(planBytes.toString('utf8')), dependencies, process.platform);
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const sourceFiles = git(['ls-files', 'src/']).split(/\r?\n/).filter(Boolean).sort();
  const digest = createHash('sha256');
  for (const relative of sourceFiles) {
    digest.update(relative).update('\0');
    digest.update(fs.existsSync(path.join(repo, relative)) ? read(relative) : '<deleted>');
    digest.update('\0');
  }
  return {
    manifest: {
      schemaVersion: 1, capturedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
      node: process.version, head: git(['rev-parse', 'HEAD']),
      pluginVersion: JSON.parse(read('manifest.json').toString('utf8')).version,
      lockSha256: sha(lockBytes), sourceSha256: digest.digest('hex'),
      plan: { path: planPath, sha256: sha(planBytes) }, dependencies,
      dependencyBaseline: dependencies.every((item) => item.status === 'passed') ? 'passed' : 'failed',
      nativeExecution: 'not-started', ownedProcesses: [], ownedSessions: [],
      configurationScope: 'No user/global configuration is read or written.',
    },
    ledger,
  };
}

export function run(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]) {
    throw new Error('Usage: node scripts/audit/backend-integration-baseline.mjs --output <evidence-directory>');
  }
  const output = path.resolve(argv[1]);
  const baseline = buildBaseline();
  fs.mkdirSync(output, { recursive: true });
  // Never replace an earlier run, including evidence from a failed attempt.
  for (const [filename, value] of [
    ['manifest.json', baseline.manifest],
    ['feature-ledger.json', baseline.ledger.features],
    ['cases.json', baseline.ledger.cases],
    ['profiles.json', baseline.ledger.profiles],
    ['coverage.json', baseline.ledger.coverage],
  ]) {
    fs.writeFileSync(path.join(output, filename), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify({ dependencyBaseline: baseline.manifest.dependencyBaseline, cases: baseline.ledger.cases.length, profiles: baseline.ledger.profiles.length, nativeExecution: 'not-started', output }, null, 2));
  return baseline.manifest.dependencyBaseline === 'passed' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = run(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
