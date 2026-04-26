import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const sourcePath = 'src';
const graphifyPaths = ['graphify-out/GRAPH_REPORT.md', 'graphify-out/graph.json'];

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const details = result.stderr.trim() || result.stdout.trim();
    throw new Error(`git ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
  }

  return result.stdout.trim();
}

function getLatestCommit(pathspecs) {
  const output = runGit(['log', '-1', '--format=%ct%x09%h%x09%s', '--', ...pathspecs]);
  if (!output) {
    return null;
  }

  const [timestamp, hash, ...subjectParts] = output.split('\t');
  return {
    hash,
    subject: subjectParts.join('\t'),
    timestamp: Number(timestamp),
  };
}

function parsePorcelainPath(line) {
  const rawPath = line.slice(3).trim();
  const renameSeparator = ' -> ';
  const renameIndex = rawPath.indexOf(renameSeparator);
  const path = renameIndex === -1 ? rawPath : rawPath.slice(renameIndex + renameSeparator.length);
  return path.replace(/^"|"$/g, '');
}

function getChangedPaths(pathspec) {
  const output = runGit(['status', '--porcelain', '--', pathspec]);
  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parsePorcelainPath);
}

function getLatestExistingMtimeMs(paths) {
  const existingTimes = paths
    .map((path) => join(repoRoot, path))
    .filter((path) => existsSync(path))
    .map((path) => statSync(path).mtimeMs);

  return existingTimes.length > 0 ? Math.max(...existingTimes) : null;
}

function getGraphifyMtimeMs() {
  for (const path of graphifyPaths) {
    const fullPath = join(repoRoot, path);
    if (!existsSync(fullPath)) {
      throw new Error(`Missing graphify artifact: ${path}`);
    }
  }

  return Math.min(...graphifyPaths.map((path) => statSync(join(repoRoot, path)).mtimeMs));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const changedSourcePaths = getChangedPaths(sourcePath);
const changedGraphifyPaths = getChangedPaths('graphify-out');

if (changedSourcePaths.length > 0) {
  const latestSourceMtimeMs = getLatestExistingMtimeMs(changedSourcePaths);
  const graphifyMtimeMs = getGraphifyMtimeMs();
  const hasDeletedOnlySourceChanges = latestSourceMtimeMs === null;
  const graphifyLooksRefreshed = hasDeletedOnlySourceChanges
    ? changedGraphifyPaths.length > 0
    : graphifyMtimeMs >= latestSourceMtimeMs;

  if (!graphifyLooksRefreshed) {
    fail([
      'graphify-out is stale for current src changes.',
      '',
      `Changed src paths: ${changedSourcePaths.length}`,
      `Changed graphify artifact paths: ${changedGraphifyPaths.length}`,
      '',
      'Run: npm run graphify:update:src',
    ].join('\n'));
  }

  console.log('graphify freshness ok for current src working-tree changes.');
  process.exit(0);
}

const latestSourceCommit = getLatestCommit([sourcePath]);
const latestGraphifyCommit = getLatestCommit(graphifyPaths);

if (!latestSourceCommit || !latestGraphifyCommit) {
  fail('Could not determine graphify freshness from git history.');
}

if (changedGraphifyPaths.length > 0) {
  const graphifyMtimeMs = getGraphifyMtimeMs();
  if (graphifyMtimeMs >= latestSourceCommit.timestamp * 1000) {
    console.log('graphify freshness ok for current graphify-out working-tree changes.');
    process.exit(0);
  }
}

if (latestSourceCommit.timestamp > latestGraphifyCommit.timestamp) {
  fail([
    'graphify-out is stale for committed src history.',
    '',
    `Latest src commit: ${latestSourceCommit.hash} ${latestSourceCommit.subject}`,
    `Latest graphify commit: ${latestGraphifyCommit.hash} ${latestGraphifyCommit.subject}`,
    '',
    'Run: npm run graphify:update:src',
  ].join('\n'));
}

console.log('graphify freshness ok.');
