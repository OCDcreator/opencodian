#!/usr/bin/env node
import fs from 'node:fs';
import {
  autoDetectRange,
  loadConfig,
  parseArgs,
  printList,
  readGitDiffNameStatus,
  repoRoot,
  requiredDocsFromDiff,
} from './module-doc-guard-lib.mjs';

const args = parseArgs();
const root = repoRoot();
const config = loadConfig(root, args.config ?? 'module-docs.config.json');

// Phase 2 Task 8: prefer the unified scope artifact (committed candidate) so a
// multi-commit PR cannot hide an undocumented source change in an earlier
// commit. Fall back to --range / autoDetectRange for direct invocation.
let diffRecords;
let rangeLabel;
if (process.env.VERIFY_SCOPE_ARTIFACT && fs.existsSync(process.env.VERIFY_SCOPE_ARTIFACT)) {
  const scope = JSON.parse(fs.readFileSync(process.env.VERIFY_SCOPE_ARTIFACT, 'utf8'));
  // Use the committed candidate view (merge-base..HEAD) for doc accountability.
  diffRecords = scope.candidates.committed.map((r) => ({
    status: r.status,
    path: r.path,
  }));
  rangeLabel = `scope:${scope.mergeBaseSha.slice(0, 8)}..${scope.headSha.slice(0, 8)} (committed)`;
} else {
  const range = args.range ?? autoDetectRange(root);
  diffRecords = readGitDiffNameStatus(root, range);
  rangeLabel = range;
}

const { changedPaths, requiredDocs } = requiredDocsFromDiff(config, diffRecords);

const missingDocTouches = requiredDocs.filter((requirement) => !changedPaths.has(requirement.docPath));

if (missingDocTouches.length > 0) {
  console.error(`[module-docs:diff] FAILED (${rangeLabel})`);
  printList(
    'Changed source modules without mapped doc changes:',
    missingDocTouches,
    (requirement) => `- ${requirement.sourcePaths.join(', ')} -> ${requirement.docPath}`,
  );
  console.error('');
  console.error('Update the mapped docs in this branch, or run list-module-doc-targets-from-diff.mjs for the full target list.');
  process.exit(1);
}

console.log(`[module-docs:diff] OK (${requiredDocs.length} required doc targets, ${rangeLabel})`);
