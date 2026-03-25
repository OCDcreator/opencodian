#!/usr/bin/env node
const { execSync } = require('child_process');
const process = require('process');

const args = process.argv.slice(2).join(' ');

try {
  execSync(`npx jest ${args}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
} catch (error) {
  process.exit(1);
}
