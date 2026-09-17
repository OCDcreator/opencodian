#!/usr/bin/env node
const { execSync } = require('child_process');
const { mkdirSync } = require('fs');
const { join } = require('path');
const process = require('process');
const { resolveJestNodeOptions } = require('./run-jest-options');

// Cap jest's default worker pool (cpus-1). On the 20-core dev box that is 19
// concurrent ts-jest/jsdom workers, and the genuinely heavy suites (puppeteer
// Chrome launches, real CLI spawns, temp-dir I/O) then blow their budgets under
// load and flake run to run. 50% keeps peak concurrency at half the cores;
// small CI runners are unaffected (2 cores -> 1 worker either way).
const userArgs = process.argv.slice(2);
const hasWorkerOverride = userArgs.some(
  (arg) => arg.startsWith('--maxWorkers') || arg.startsWith('--max-workers'),
);
const args = [...userArgs, ...(hasWorkerOverride ? [] : ['--maxWorkers=50%'])].join(' ');
const storageDir = join(process.cwd(), '.tmp');
const storageFile = join(storageDir, 'jest-node-localstorage.json');

mkdirSync(storageDir, { recursive: true });

try {
  execSync(`npx jest ${args}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: resolveJestNodeOptions({
        existingNodeOptions: process.env.NODE_OPTIONS,
        storageFile,
      }),
    },
  });
} catch (error) {
  process.exit(1);
}
