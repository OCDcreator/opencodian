import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

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

syncCommittedArtifacts();
removeScopedOutput();

process.stdout.write('Synced src-scoped graphify artifacts back to graphify-out/ and cleaned src/graphify-out/.\n');
