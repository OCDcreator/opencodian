import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from './module-doc-guard-lib.mjs';

function main() {
  const root = repoRoot();
  const hooksDir = path.join(root, '.githooks');

  if (!fs.existsSync(hooksDir)) {
    throw new Error('Missing .githooks directory. Create the repo-local hooks before installing them.');
  }

  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: root,
    stdio: 'inherit',
  });

  process.stdout.write('Installed repo-local git hooks at .githooks\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`Failed to install repo-local hooks: ${error.message}\n`);
  process.exitCode = 1;
}
