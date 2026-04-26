import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const sourceRoot = join(repoRoot, 'src');
const scopedOutputDir = join(sourceRoot, 'graphify-out');
const committedOutputDir = join(repoRoot, 'graphify-out');

function resolveGraphifyCommand() {
  if (process.platform === 'win32') {
    return {
      command: 'py',
      args: ['-m', 'graphify', 'update', 'src'],
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
        args: ['-m', 'graphify', 'update', 'src'],
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

const { command, args } = resolveGraphifyCommand();
const update = spawnSync(command, args, {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (update.status !== 0) {
  process.exit(update.status ?? 1);
}

syncCommittedArtifacts();
removeScopedOutput();

console.log('Synced src-scoped graphify artifacts back to graphify-out/ and cleaned src/graphify-out/.');
