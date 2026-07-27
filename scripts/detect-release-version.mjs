#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const ZERO_SHA_PATTERN = /^0{40}$/;

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function validateVersionIndex(versionsText, version, minAppVersion) {
  const versions = parseJson(versionsText, 'versions.json');
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    throw new Error('versions.json must contain an object');
  }
  if (typeof minAppVersion !== 'string' || minAppVersion.trim().length === 0) {
    throw new Error('manifest.json minAppVersion must be a non-empty string');
  }
  parseSemver(minAppVersion, 'manifest.json minAppVersion');
  if (versions[version] !== minAppVersion) {
    throw new Error(`versions.json must map ${version} to manifest.json minAppVersion ${minAppVersion}`);
  }
}

export function parseSemver(version, label = 'version') {
  if (typeof version !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const match = SEMVER_PATTERN.exec(version);
  if (!match) {
    throw new Error(`${label} must be a valid SemVer value`);
  }
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'))) {
    throw new Error(`${label} must not use leading zeroes in numeric prerelease identifiers`);
  }
  return {
    raw: version,
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
  };
}

function compareIdentifier(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const leftNumber = BigInt(left);
    const rightNumber = BigInt(right);
    return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
  }
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion, 'current version');
  const right = parseSemver(rightVersion, 'previous version');
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const comparison = compareIdentifier(left.prerelease[index], right.prerelease[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function detectReleaseChange({ manifestText, packageText, lockText, versionsText, previousManifestText }) {
  const manifest = parseJson(manifestText, 'manifest.json');
  const packageJson = parseJson(packageText, 'package.json');
  const lock = parseJson(lockText, 'package-lock.json');
  const version = manifest.version;
  const parsedVersion = parseSemver(version, 'manifest.json version');
  validateVersionIndex(versionsText, version, manifest.minAppVersion);

  const versionSources = [
    ['package.json', packageJson.version],
    ['package-lock.json', lock.version],
    ['package-lock.json root package', lock.packages?.['']?.version],
  ];
  for (const [label, candidate] of versionSources) {
    if (candidate !== version) {
      throw new Error(`${label} version must match manifest.json version ${version}`);
    }
  }

  if (previousManifestText === null) {
    return { changed: false, version, previousVersion: null, tag: `v${version}`, prerelease: parsedVersion.prerelease.length > 0 };
  }

  const previousManifest = parseJson(previousManifestText, 'previous manifest.json');
  const previousVersion = previousManifest.version;
  parseSemver(previousVersion, 'previous manifest.json version');
  if (previousVersion === version) {
    return { changed: false, version, previousVersion, tag: `v${version}`, prerelease: parsedVersion.prerelease.length > 0 };
  }
  if (compareSemver(version, previousVersion) <= 0) {
    throw new Error(`release version must increase: ${previousVersion} -> ${version}`);
  }
  return { changed: true, version, previousVersion, tag: `v${version}`, prerelease: parsedVersion.prerelease.length > 0 };
}

function readPreviousManifest(rootDir, beforeSha) {
  if (!beforeSha || ZERO_SHA_PATTERN.test(beforeSha)) return null;
  if (!/^[a-f0-9]{40}$/i.test(beforeSha)) {
    throw new Error('RELEASE_BEFORE_SHA must be a 40-character commit SHA');
  }
  try {
    return execFileSync('git', ['show', `${beforeSha}:manifest.json`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error.stderr?.trim();
    throw new Error(`cannot read manifest.json from RELEASE_BEFORE_SHA${detail ? `: ${detail}` : ''}`);
  }
}

function appendOutputs(outputPath, result) {
  if (!outputPath) throw new Error('GITHUB_OUTPUT is required for release detection');
  const lines = [
    `changed=${result.changed}`,
    `version=${result.version}`,
    `previous_version=${result.previousVersion ?? ''}`,
    `tag=${result.tag}`,
    `prerelease=${result.prerelease}`,
  ];
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

export function detectReleaseFromRepository({
  rootDir = process.cwd(),
  beforeSha = process.env.RELEASE_BEFORE_SHA,
  outputPath = process.env.GITHUB_OUTPUT,
} = {}) {
  const result = detectReleaseChange({
    manifestText: fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'),
    packageText: fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
    lockText: fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'),
    versionsText: fs.readFileSync(path.join(rootDir, 'versions.json'), 'utf8'),
    previousManifestText: readPreviousManifest(rootDir, beforeSha),
  });
  appendOutputs(outputPath, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    detectReleaseFromRepository();
  } catch (error) {
    console.error(`[release-detect] ${error.message}`);
    process.exitCode = 1;
  }
}
