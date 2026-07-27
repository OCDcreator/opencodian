#!/usr/bin/env node
const { execSync } = require('child_process');
const { mkdirSync } = require('fs');
const { join } = require('path');
const process = require('process');
const { resolveJestNodeOptions } = require('./run-jest-options');

const args = process.argv.slice(2).join(' ');
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
