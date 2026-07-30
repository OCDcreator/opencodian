// check:change-scope gate.
//
// Validates that the unified change scope resolves cleanly and prints the
// resolved base/head/merge-base SHAs plus the committed/index/workspace
// candidate digests. This gate exists primarily to surface the resolved scope
// to diff-aware gates and to fail closed when base cannot be resolved.
//
// It does NOT replace the individual architecture gates; it is consumed by the
// run-verify runner which passes the scope artifact to every diff-aware gate.
//
// Exit code 0 = scope resolved, 1 = base could not be resolved (fail closed).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  computeChangeScope,
  repoRoot,
  resolveBaseRef,
} from './change-scope-lib.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { base: null, head: 'HEAD', json: false, artifact: null, print: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--base') {
      args.base = argv[++i];
    } else if (item.startsWith('--base=')) {
      args.base = item.slice('--base='.length);
    } else if (item === '--head') {
      args.head = argv[++i];
    } else if (item.startsWith('--head=')) {
      args.head = item.slice('--head='.length);
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--print') {
      args.print = true;
    } else if (item === '--artifact') {
      args.artifact = argv[++i];
    } else if (item.startsWith('--artifact=')) {
      args.artifact = item.slice('--artifact='.length);
    } else if (!item.startsWith('--')) {
      positional.push(item);
    }
  }
  if (positional[0]) args.base = args.base ?? positional[0];
  return args;
}

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const baseResolution = resolveBaseRef(root, { explicit: args.base });
  if (!baseResolution.ref) {
    process.stderr.write(`FAIL change-scope\n- ${baseResolution.error}\n`);
    process.exitCode = 1;
    return;
  }

  let scope;
  try {
    scope = computeChangeScope(root, { baseRef: baseResolution.ref, headRef: args.head });
  } catch (error) {
    process.stderr.write(`FAIL change-scope\n- ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  // Optionally write a temp scope artifact for diff-aware gates to consume.
  if (args.artifact) {
    const artifactPath = path.isAbsolute(args.artifact) ? args.artifact : path.join(root, args.artifact);
    fs.writeFileSync(artifactPath, JSON.stringify(scope, null, 2) + '\n');
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(scope, null, 2) + '\n');
  } else {
    process.stdout.write(
      `PASS change-scope\n` +
        `- base: ${scope.baseRef} (${scope.baseSha})\n` +
        `- head: ${scope.headRef} (${scope.headSha})\n` +
        `- merge-base: ${scope.mergeBaseSha}\n` +
        `- committed digest: ${scope.digests.committed}\n` +
        `- index digest: ${scope.digests.index}\n` +
        `- workspace digest: ${scope.digests.workspace}\n` +
        `- changed paths: ${scope.paths.length}\n` +
        `- empty: ${scope.isEmpty}\n`,
    );
  }
  process.exitCode = 0;
}

main();
