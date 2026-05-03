import process from 'node:process';

import {
  buildGuardTargetAssessments,
  collectThinLayerHints,
  detectDiffRange,
  detectMode,
  evaluateOwnerGuard,
  formatOwnerGuardResult,
  parseArgs,
  readGitDiffNameOnly,
  repoRoot,
} from './owner-guard-lib.mjs';

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const range = detectDiffRange(root, args.range);
  const mode = detectMode(args.mode);
  const changedPaths = readGitDiffNameOnly(root, range);
  const fileAssessments = buildGuardTargetAssessments(root, range, changedPaths);
  const thinLayerHints = collectThinLayerHints(changedPaths);
  const result = evaluateOwnerGuard({
    mode,
    changedPaths,
    fileAssessments,
    thinLayerHints,
  });

  process.stdout.write(formatOwnerGuardResult(result, { range, mode }));
  process.exitCode = result.ok ? 0 : 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`FAIL owner-guard\n- ${error.message}\n`);
  process.exitCode = 1;
}
