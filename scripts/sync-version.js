#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const version = packageJson.version;

// Update manifest.json
const manifestPath = path.join(process.cwd(), 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
manifest.version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Keep the standard Obsidian compatibility index in lockstep with every release.
const versionsPath = path.join(process.cwd(), 'versions.json');
const versions = fs.existsSync(versionsPath)
  ? JSON.parse(fs.readFileSync(versionsPath, 'utf-8'))
  : {};
if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
  throw new Error('versions.json must contain an object.');
}
if (typeof manifest.minAppVersion !== 'string' || manifest.minAppVersion.trim().length === 0) {
  throw new Error('manifest.json must contain minAppVersion before synchronizing versions.json.');
}
versions[version] = manifest.minAppVersion;
fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');

console.log(`Version and versions.json synced: ${version}`);
