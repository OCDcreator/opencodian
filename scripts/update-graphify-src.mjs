import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildInputManifest } from './graph-input-digest.mjs';

const repoRoot = process.cwd();
const sourceRoot = join(repoRoot, 'src');
const scopedOutputDir = join(sourceRoot, 'graphify-out');
const committedOutputDir = join(repoRoot, 'graphify-out');
const graphifyUpdateRunner = join(repoRoot, 'scripts', 'run-graphify-update.py');

function resolveGraphifyCommand() {
  if (process.platform === 'win32') {
    return {
      command: 'py',
      args: [graphifyUpdateRunner, 'src'],
    };
  }

  // Check repo-local venv first (created via: python3.13 -m venv .graphify-venv && pip install graphifyy)
  const localVenvPython = join(repoRoot, '.graphify-venv', 'bin', 'python3');
  const allCandidates = [localVenvPython, 'python3', 'python'];
  for (const command of allCandidates) {
    const probe = spawnSync(command, ['-c', 'import graphify'], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    if (probe.status === 0) {
      return {
        command,
        args: [graphifyUpdateRunner, 'src'],
      };
    }
  }

  throw new Error(
    'Could not find a Python interpreter with graphify installed. '
    + 'Create a venv with: python3.13 -m venv .graphify-venv && .graphify-venv/bin/pip install graphifyy',
  );
}

function assertScopedOutputExists(path) {
  if (!existsSync(path)) {
    throw new Error(`Expected graphify output at ${path}, but it was not created.`);
  }
}

function resolveGraphifyVersion() {
  // Resolve the installed Graphify tool version using the SAME python
  // interpreter the wrapper uses to run graphify (repo venv, then python3/
  // python). The version is exposed via the CLI (`<py> -m graphify --version`)
  // and the package metadata. Falling back to 'unknown' would let a tool
  // upgrade silently pass the content-addressed freshness gate.
  const localVenvPython = join(repoRoot, '.graphify-venv', 'bin', 'python3');
  const interpreters = [localVenvPython, 'python3', 'python'];
  const argSets = [
    ['-m', 'graphify', '--version'],
    ['-c', 'import graphify; print(getattr(graphify, "__version__", ""))'],
    ['-c', 'import importlib.metadata as m; print(m.version("graphifyy"))'],
  ];
  for (const py of interpreters) {
    for (const args of argSets) {
      try {
        const probe = spawnSync(py, args, { cwd: repoRoot, encoding: 'utf8' });
        if (probe.status === 0) {
          const version = probe.stdout.trim();
          if (version && version !== 'unknown') {
            return version;
          }
        }
      } catch {
        // try next
      }
    }
  }
  return 'unknown';
}

function writeInputManifest() {
  // Phase 2 Task 7: write a deterministic graph-input manifest so the freshness
  // gate can compare content digests instead of commit timestamps/mtimes.
  let headSha = null;
  try {
    headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    // ignore
  }
  const manifest = buildInputManifest(repoRoot, {
    graphifyVersion: resolveGraphifyVersion(),
    headSha,
  });
  writeFileSync(join(committedOutputDir, 'input-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function syncCommittedArtifacts() {
  mkdirSync(committedOutputDir, { recursive: true });

  const committedFiles = ['GRAPH_REPORT.md', 'graph.json'];
  for (const fileName of committedFiles) {
    const scopedPath = join(scopedOutputDir, fileName);
    assertScopedOutputExists(scopedPath);
    cpSync(scopedPath, join(committedOutputDir, fileName), {
      force: true,
    });
  }

  // Write the input manifest AFTER copying artifacts but BEFORE patching the
  // report freshness block (the block reads the manifest digest).
  writeInputManifest();

  // Patch the report freshness block to record the content digest (informational
  // HEAD SHA + Source digest), replacing the stale "Built from commit" signal.
  patchReportFreshnessBlock();
}

function patchReportFreshnessBlock() {
  const reportPath = join(committedOutputDir, 'GRAPH_REPORT.md');
  if (!existsSync(reportPath)) return;
  const manifestPath = join(committedOutputDir, 'input-manifest.json');
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let text = readFileSync(reportPath, 'utf8');
  const headSha = manifest.headShaAtGeneration ?? 'unknown';
  const digest = manifest.digest;
  const block = [
    '## Graph Freshness',
    `- Source digest: \`${digest}\``,
    `- Generated at: ${manifest.generatedAt}`,
    `- HEAD at generation: \`${headSha}\` (informational only; the content digest is the correctness signal)`,
    `- Run \`npm run graphify:update:src\` after \`src/\`, tsconfig, package/lock, ignore rules, wrapper or Graphify version changes.`,
    '',
  ].join('\n');
  // Replace an existing freshness block, or insert after the first heading.
  const freshnessMatch = text.match(/## Graph Freshness[\s\S]*?(?=\n## |\n$|$)/);
  if (freshnessMatch) {
    text = text.replace(freshnessMatch[0], block.trimEnd());
  } else {
    const firstHeadingEnd = text.indexOf('\n', text.indexOf('#'));
    text = firstHeadingEnd >= 0 ? `${text.slice(0, firstHeadingEnd + 1)}\n${block}${text.slice(firstHeadingEnd + 1)}` : `${text}\n${block}`;
  }
  writeFileSync(reportPath, text);
}

function removeScopedOutput() {
  if (existsSync(scopedOutputDir)) {
    rmSync(scopedOutputDir, {
      recursive: true,
      force: true,
    });
  }
}

function emitProcessOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function isHtmlVizLimitFailure(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`.includes('too large for HTML viz');
}

const { command, args } = resolveGraphifyCommand();
removeScopedOutput();
const update = spawnSync(command, args, {
  cwd: repoRoot,
  encoding: 'utf8',
});
emitProcessOutput(update);

if (update.status !== 0) {
  const hasRequiredArtifacts = existsSync(join(scopedOutputDir, 'GRAPH_REPORT.md'))
    && existsSync(join(scopedOutputDir, 'graph.json'));
  if (!hasRequiredArtifacts || !isHtmlVizLimitFailure(update)) {
    process.exit(update.status ?? 1);
  }
  process.stderr.write('graphify exited non-zero after writing required report/json artifacts; continuing without HTML viz.\n');
}

// syncCommittedArtifacts copies artifacts, writes the manifest, then patches
// the report (in that order, since the patch reads the manifest).
syncCommittedArtifacts();
removeScopedOutput();

process.stdout.write('Synced src-scoped graphify artifacts back to graphify-out/ and cleaned src/graphify-out/.\n');
