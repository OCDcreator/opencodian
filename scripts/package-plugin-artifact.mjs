import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const PLUGIN_ARTIFACT_FILES = Object.freeze([
  'main.js',
  'manifest.json',
  'styles.css',
]);

function resolveConfinedDirectory(rootDir, candidate, label) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child of the repository root: ${resolved}`);
  }

  return resolved;
}

async function assertSafeDirectoryPath(rootDir, directoryPath, label, { mustExist }) {
  const relative = path.relative(rootDir, directoryPath);
  let current = rootDir;

  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (!mustExist && error?.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    if (stat.isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symlink: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} must traverse directories only: ${current}`);
    }
  }
}

function pathsOverlap(first, second) {
  const firstToSecond = path.relative(first, second);
  const secondToFirst = path.relative(second, first);
  return !firstToSecond || !secondToFirst
    || (!firstToSecond.startsWith('..') && !path.isAbsolute(firstToSecond))
    || (!secondToFirst.startsWith('..') && !path.isAbsolute(secondToFirst));
}

async function readRequiredRegularFile(filePath) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Plugin artifact source must be a regular file: ${filePath}`);
  }

  await fs.access(filePath, fsConstants.R_OK);
  return fs.readFile(filePath);
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function packagePluginArtifact({
  rootDir = process.cwd(),
  distDir = 'dist',
  outputDir = 'artifacts/opencodian',
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedDist = resolveConfinedDirectory(resolvedRoot, distDir, 'distDir');
  const resolvedOutput = resolveConfinedDirectory(resolvedRoot, outputDir, 'outputDir');
  const sourceContents = new Map();

  if (pathsOverlap(resolvedDist, resolvedOutput)) {
    throw new Error('distDir and outputDir must be disjoint');
  }

  await assertSafeDirectoryPath(resolvedRoot, resolvedDist, 'distDir', { mustExist: true });
  await assertSafeDirectoryPath(resolvedRoot, resolvedOutput, 'outputDir', { mustExist: false });

  for (const fileName of PLUGIN_ARTIFACT_FILES) {
    const sourcePath = path.join(resolvedDist, fileName);
    sourceContents.set(fileName, await readRequiredRegularFile(sourcePath));
  }

  const manifest = JSON.parse(sourceContents.get('manifest.json').toString('utf8'));
  if (manifest?.id !== 'opencodian' || typeof manifest.version !== 'string' || !manifest.version) {
    throw new Error('dist/manifest.json is not a valid OpenCodian plugin manifest');
  }

  await fs.rm(resolvedOutput, { recursive: true, force: true });
  await fs.mkdir(resolvedOutput, { recursive: true });

  const hashes = {};
  for (const fileName of PLUGIN_ARTIFACT_FILES) {
    const content = sourceContents.get(fileName);
    await fs.writeFile(path.join(resolvedOutput, fileName), content, { flag: 'wx' });
    hashes[fileName] = sha256(content);
  }

  const packagedEntries = (await fs.readdir(resolvedOutput, { withFileTypes: true }))
    .map((entry) => entry.name)
    .sort();
  const expectedEntries = [...PLUGIN_ARTIFACT_FILES].sort();
  if (JSON.stringify(packagedEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`Plugin artifact must contain exactly: ${expectedEntries.join(', ')}`);
  }

  return {
    directory: resolvedOutput,
    files: [...PLUGIN_ARTIFACT_FILES],
    hashes,
    version: manifest.version,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const result = await packagePluginArtifact();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
