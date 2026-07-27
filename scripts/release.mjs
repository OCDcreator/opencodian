#!/usr/bin/env node
import { execSync } from 'child_process';

const bumpType = process.argv[2] || 'patch';

// Validate bump type
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`Invalid bump type: ${bumpType}. Use patch, minor, or major.`);
  process.exit(1);
}

console.log(`Bumping version (${bumpType})...`);

// Use npm version command to update package.json and package-lock.json
// --no-git-tag-version: don't create git tag
// The existing "version" lifecycle hook will sync manifest.json
execSync(`npm version ${bumpType} --no-git-tag-version`, { stdio: 'inherit' });

console.log('Release complete. Files updated: package.json, package-lock.json, manifest.json, versions.json');
