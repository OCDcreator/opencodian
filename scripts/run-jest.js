#!/usr/bin/env node
const { execSync } = require('child_process');
const { mkdirSync } = require('fs');
const { join } = require('path');
const process = require('process');

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
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--localstorage-file=${storageFile}`,
      ].filter(Boolean).join(' '),
    },
  });
} catch (error) {
  process.exit(1);
}
