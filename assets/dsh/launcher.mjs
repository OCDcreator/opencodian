import { constants, existsSync } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const INHERITED_PACKAGE = '@opencodian/dsh-inherited-profile';
const INHERITED_SOURCE = '.opencodian-inherited';
const OWNER_MARKER = '.opencodian-dsh-profile.json';
const inheritedDependency = `file:./${INHERITED_SOURCE}`;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const within = (root, target) => target === root || target.startsWith(root + path.sep);

async function statOptional(filename) {
  try { return await lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Reject redirected/unowned writable boundaries before any profile or package-manager write. */
async function ownedPath(filename, directory, optional = false) {
  const stat = await statOptional(filename);
  if (!stat && optional) return false;
  if (!stat || stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)
    || (process.getuid && stat.uid !== process.getuid()) || (process.platform !== 'win32' && (stat.mode & 0o022))) {
    throw new Error('Harness managed profile contains an unsafe owned path');
  }
  return true;
}

async function ownedDirectory(filename) {
  await mkdir(filename, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  await ownedPath(filename, true);
}

async function privateFile(filename, value, onlyIfMissing = false) {
  const present = await ownedPath(filename, false, true);
  if (present && onlyIfMissing) return;
  const handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | (present ? 0 : constants.O_EXCL) | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (process.getuid && stat.uid !== process.getuid())
      || (process.platform !== 'win32' && (stat.mode & 0o022))) throw new Error('Harness managed profile write target changed ownership');
    await handle.truncate(0);
    await handle.writeFile(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
    await handle.chmod(0o600);
  } finally { await handle.close(); }
}

/** The only durable write root. The caller passes a canonical allowlisted parent and a vault hash. */
export async function openManagedProfile(location, forbiddenRoots = []) {
  if (!isObject(location) || !/^[a-f0-9]{64}$/.test(location.vaultHash)
    || !['sdk', 'acp'].includes(location.profile) || !path.isAbsolute(location.allowedRoot)
    || location.root !== path.join(location.allowedRoot, location.vaultHash, location.profile)) {
    throw new Error('Invalid Harness managed profile location');
  }
  for (const root of forbiddenRoots) {
    const canonical = existsSync(root) ? await realpath(root) : path.resolve(root);
    if (within(canonical, location.root) || within(location.root, canonical)) throw new Error('Harness managed profile overlaps an inherited source');
  }
  // Canonicalize an existing ancestor first; a symlink planted below it is never followed by mkdir.
  const missing = [];
  let ancestor = location.allowedRoot;
  while (!await statOptional(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('Invalid Harness managed profile parent');
    ancestor = parent;
  }
  if (await realpath(ancestor) !== ancestor) throw new Error('Harness managed profile parent changed canonical location');
  for (const part of missing) { ancestor = path.join(ancestor, part); await ownedDirectory(ancestor); }
  await ownedPath(location.allowedRoot, true);
  await ownedDirectory(path.join(location.allowedRoot, location.vaultHash));
  await ownedDirectory(location.root);
  if (await realpath(location.root) !== location.root) throw new Error('Harness managed profile is not canonical');
  const expected = { version: 1, owner: 'opencodian.dsh', vaultHash: location.vaultHash, profile: location.profile };
  const marker = path.join(location.root, OWNER_MARKER);
  if (await ownedPath(marker, false, true)) {
    const actual = JSON.parse(await readFile(marker, 'utf8'));
    if (Object.keys(actual).length !== 4 || Object.keys(expected).some((key) => actual[key] !== expected[key])) {
      throw new Error('Harness managed profile ownership marker does not match');
    }
  } else {
    if ((await readdir(location.root)).length) throw new Error('Harness managed profile is not an empty owned directory');
    await privateFile(marker, expected);
  }
  for (const file of ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock',
    'pnpm-workspace.yaml', '.npmrc', 'cordis.yml', 'cordis.patch.yml', 'compatibility.json']) {
    await ownedPath(path.join(location.root, file), false, true);
  }
  await ownedDirectory(path.join(location.root, 'node_modules'));
  return location.root;
}

/** Parse at the original file, retaining upstream !!js AST and resolving source-local plugin imports. */
export function originalPatches(boot, filename, installAnchor, aliases = new Map()) {
  const patches = boot.loadOverlayPatches('dsh', filename);
  const requireSource = createRequire(filename);
  const requireInstalled = createRequire(installAnchor ?? filename);
  const visit = (row) => {
    if (typeof row.name === 'string' && !row.name.startsWith('file:')) {
      try { requireInstalled.resolve(row.name); }
      catch {
        try {
          const original = row.name;
          row.name = pathToFileURL(requireSource.resolve(original)).href;
          aliases.set(`${row.id}\0${original}`, row.name);
        } catch { /* Preserve the logical name and let upstream report an unavailable plugin. */ }
      }
    }
    // Includes have their own document base, unlike ordinary cwd-relative tool configuration.
    if (typeof row.name === 'string' && (row.name.includes('cordis-plugin-include') || row.name === 'cordis:include')) {
      aliases.set(`include\0${row.id}`, true);
      if (typeof row.config?.path === 'string') row.config.path = path.resolve(path.dirname(filename), row.config.path);
    }
    if (row.group && Array.isArray(row.config)) row.config.forEach(visit);
  };
  for (const patch of patches) patch.insert?.forEach(visit);
  return normalizeAssertions(patches, filename, aliases);
}

function normalizeAssertions(patches, filename, aliases) {
  for (const patch of patches) {
    if (patch.insert) continue;
    if (typeof patch.name === 'string') {
      const alias = aliases.get(`${patch.id}\0${patch.name}`);
      if (alias) patch.name = alias;
      else if (path.isAbsolute(patch.name) || patch.name.startsWith('./') || patch.name.startsWith('../'))
        patch.name = pathToFileURL(path.resolve(path.dirname(filename), patch.name)).href;
    }
    if (aliases.has(`include\0${patch.id}`) && typeof patch.config?.path === 'string')
      patch.config.path = path.resolve(path.dirname(filename), patch.config.path);
  }
  return patches;
}

/** Read source manifests without loadProfile/loadProfileDirectory, which may rewrite old manifests. */
export function readInheritedProfile(boot, source, installAnchor, template) {
  const manifest = existsSync(path.join(source, 'package.json')) ? boot.readProfileManifest('dsh', source) : { dsh: { profile: template } };
  const patches = [];
  const aliases = new Map();
  const skippedBundles = [];
  const exemptions = existsSync(path.join(source, 'compatibility.json')) ? boot.readProfileVersionExemptions(source) : {};
  for (const packageName of manifest.dsh?.profile?.bundles ?? []) {
    try {
      const packageDir = boot.resolveBundleDir('dsh', packageName, installAnchor, source);
      const bundleManifest = boot.readProfileManifest('dsh', packageDir);
      const bundle = bundleManifest.dsh?.bundle;
      if (!bundle) throw new Error('Inherited package has no bundle declaration');
      boot.assertBundlePlatform(bundle.platforms, process.platform);
      const issue = boot.evaluatePluginCompatibility(bundleManifest, exemptions);
      if (issue && !issue.exempted) throw new Error(boot.pluginCompatibilityWarning(issue));
      for (const filename of boot.bundlePatchPaths(packageDir, bundle)) patches.push(...originalPatches(boot, filename, installAnchor, aliases));
    } catch (error) { skippedBundles.push({ packageName, reason: String(error) }); }
  }
  const patch = path.join(source, 'cordis.patch.yml');
  if (existsSync(patch)) patches.push(...originalPatches(boot, patch, installAnchor, aliases));
  return { patches, skippedBundles, aliases };
}

/** A tiny local bundle survives upstream reloads without copying or linking the user's dependencies. */
export async function writeInheritedBundle(root, inherited, source) {
  const sourceDir = path.join(root, INHERITED_SOURCE);
  const scope = path.join(root, 'node_modules', '@opencodian');
  const installed = path.join(scope, 'dsh-inherited-profile');
  await ownedDirectory(sourceDir);
  await ownedDirectory(scope);
  // npm may link this one file: dependency to our own source; never follow any other link.
  const installedStat = await statOptional(installed);
  if (installedStat?.isSymbolicLink()) {
    if (await realpath(installed) !== sourceDir) throw new Error('Harness inherited bundle was redirected outside its owned source');
  } else await ownedDirectory(installed);
  const bundle = { name: INHERITED_PACKAGE, version: '1.0.0', private: true,
    dsh: { bundle: { patch: 'cordis.patch.yml' } } };
  for (const directory of new Set([sourceDir, installedStat?.isSymbolicLink() ? sourceDir : installed])) {
    await privateFile(path.join(directory, 'package.json'), bundle);
    await privateFile(path.join(directory, 'cordis.patch.yml'), inherited.patches);
  }
  const manifestPath = path.join(root, 'package.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {
    name: 'opencodian-dsh-managed-profile', private: true, dependencies: { [INHERITED_PACKAGE]: inheritedDependency },
    dsh: { profile: { bundles: [INHERITED_PACKAGE] } },
  };
  if (manifest.dependencies?.[INHERITED_PACKAGE] !== inheritedDependency
    || manifest.dsh?.profile?.bundles?.[0] !== INHERITED_PACKAGE) throw new Error('Harness managed profile inheritance was replaced');
  await privateFile(manifestPath, manifest, true);
  await privateFile(path.join(root, 'cordis.patch.yml'), '[]\n', true);
  await privateFile(path.join(root, 'cordis.yml'), '[]\n');
  await privateFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n', true);
  const compatibility = path.join(source, 'compatibility.json');
  if (existsSync(compatibility)) await privateFile(path.join(root, 'compatibility.json'), await readFile(compatibility, 'utf8'), true);
}

export function splitLaunchArguments(args) {
  const patchFiles = [];
  const appArgs = [];
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === '--patch' || value.startsWith('--patch=')) {
      const file = value === '--patch' ? args[++index] : value.slice('--patch='.length);
      if (!file || file.startsWith('--')) throw new Error('Harness --patch requires a filename');
      patchFiles.push(path.resolve(file));
    } else if (/^--(?:from-default-profile|profile|mode)(?:=|$)/.test(value)) {
      throw new Error('OpenCodian cannot replace a Harness profile');
    } else appArgs.push(value);
  }
  return { patchFiles, appArgs };
}

/** Sparse maps merge; arrays replace. Inherited expression nodes stay opaque. */
export function mergeConfiguration(base, overlay) {
  if (Array.isArray(overlay)) return overlay.map((value) => mergeConfiguration(undefined, value));
  if (!isObject(overlay)) return structuredClone(overlay);
  if (Object.hasOwn(overlay, '__jsExpr') || Object.keys(overlay).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
    throw new Error('Harness configuration overlay contains a protected key');
  }
  if (isObject(base) && Object.hasOwn(base, '__jsExpr')) throw new Error('Harness cannot merge an object override into an inherited expression');
  const result = isObject(base) ? structuredClone(base) : {};
  for (const [key, value] of Object.entries(overlay)) result[key] = mergeConfiguration(result[key], value);
  return result;
}

function flattenEntries(entries) {
  return entries.flatMap((entry) => [entry, ...entry.group && Array.isArray(entry.config) ? flattenEntries(entry.config) : []]);
}

function correctedHomeRows(boot, baseLayers, original, normalized) {
  if (JSON.stringify(original) === JSON.stringify(normalized)) return [];
  const before = flattenEntries(boot.composeEntries([...baseLayers, original]));
  return flattenEntries(boot.composeEntries([...baseLayers, normalized])).flatMap((row) => {
    const existing = before.filter((candidate) => candidate.id === row.id);
    if (existing.length !== 1 || existing[0].name !== row.name)
      throw new Error('Harness home overlay contains an unsupported source-local plugin identity');
    if (JSON.stringify(existing[0]) === JSON.stringify(row)) return [];
    return [{ ...row, id: row.id }];
  });
}

export function composeConfigurationPatches(boot, layers, configuration, profile = 'sdk') {
  const entries = flattenEntries(boot.composeEntries(layers));
  const overlays = [...configuration];
  if (profile === 'acp') {
    // ACP agentOptions passes its profile row's provider/model explicitly, ahead of
    // agent-default-model. Mirror only saved overrides; omission restores ACP inheritance.
    const defaults = configuration.find((entry) => entry.id === 'agent-default-model')?.config;
    const route = Object.fromEntries(['provider', 'model'].filter((key) => defaults && Object.hasOwn(defaults, key))
      .map((key) => [key, defaults[key]]));
    if (Object.keys(route).length) overlays.push({ id: 'acp', config: route });
  }
  return overlays.map(({ id, config }) => {
    const matches = entries.filter((entry) => entry.id === id);
    if (matches.length !== 1) throw new Error(`Harness configuration namespace is unavailable or ambiguous: ${id}`);
    return { id, config: mergeConfiguration(matches[0].config ?? {}, config) };
  });
}

/** Fixed trusted resolver: refs are identifiers, never code; values live only in this plugin mount. */
export async function resolveHeaderCredentials(ctx, refs) {
  const headers = Object.create(null);
  try {
    const credentials = ctx.get('credentials');
    if (typeof credentials?.resolve !== 'function') throw new Error();
    for (const [provider, names] of Object.entries(refs)) {
      headers[provider] = Object.create(null);
      for (const [header, ref] of Object.entries(names)) {
        const resolved = await credentials.resolve(ref);
        if (typeof resolved?.value !== 'string' || !resolved.value || /[\r\n]/.test(resolved.value)) throw new Error();
        headers[provider][header] = resolved.value;
      }
    }
  } catch { throw new Error('Harness provider header credential could not be resolved'); }
  ctx.provide('opencodianHeaderCredentials', { headers });
}

export async function applyHeaderCredentialBridge(boot, layers, controlled, refs, scope) {
  if (!Object.keys(refs).length) return;
  const rows = flattenEntries(boot.composeEntries([...layers, controlled]));
  const providers = rows.filter((row) => row.id === 'llm-pi-ai');
  if (providers.length !== 1 || rows.some((row) => row.id === 'opencodian-header-credentials')) {
    throw new Error('Harness credential header bridge requires one unambiguous provider row');
  }
  const provider = providers[0];
  const config = structuredClone(provider.config ?? {});
  for (const [name, names] of Object.entries(refs)) {
    if (!isObject(names) || !isObject(config.providers?.[name])) throw new Error('Invalid Harness provider credential references');
    const headers = { ...config.providers[name].headers };
    for (const [header, ref] of Object.entries(names)) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header) || typeof ref !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) {
        throw new Error('Invalid Harness provider credential reference');
      }
      for (const existing of Object.keys(headers)) if (existing.toLowerCase() === header.toLowerCase()) delete headers[existing];
      headers[header] = { __jsExpr: `ctx.get('opencodianHeaderCredentials').headers[${JSON.stringify(name)}][${JSON.stringify(header)}]` };
    }
    config.providers[name].headers = headers;
  }
  const inject = Array.isArray(provider.inject) ? Object.fromEntries(provider.inject.map((name) => [name, null])) : { ...provider.inject };
  inject.opencodianHeaderCredentials = null;
  // This dependency is protected alongside the Native bridge and survives package recomposition as an overlay.
  controlled.push({ id: 'llm-pi-ai', config, inject });
  const filename = path.join(scope, 'header-credentials.mjs');
  await privateFile(filename, `export const inject = ['credentials'];\nexport default ${resolveHeaderCredentials.toString()}\n`);
  controlled.push({ insert: [{ id: 'opencodian-header-credentials', name: filename, inject: ['credentials'], config: refs }] });
}

/** Boot the installed runtime with a durable owned package project and private launch-only overlays. */
export async function launchNativeRuntime({ nativeAnchor, scope, args, managedProfile, configuration = [], headerCredentialRefs = {} }) {
  const requireNative = createRequire(nativeAnchor);
  const load = async (name) => import(pathToFileURL(requireNative.resolve(name)).href);
  const boot = await load('@deepseek-ai/dsh-app-boot');
  // PROFILE_TEMPLATES moved in 0.2.2-rc.1; retain the public older export fallback.
  let PROFILE_TEMPLATES;
  try { ({ PROFILE_TEMPLATES } = await load('@deepseek-ai/dsh-official-bundles')); }
  catch { ({ PROFILE_TEMPLATES } = boot); }
  const { resolveDshHome } = await load('@deepseek-ai/dsh-home-paths');
  const { runProfile, INSTALL_ANCHOR } = await import(pathToFileURL(path.join(path.dirname(nativeAnchor), 'profile-boot.js')).href);
  const environment = boot.loadLayeredEnv('dsh');
  const home = resolveDshHome();
  const source = path.join(home, 'profiles', managedProfile.profile);
  const root = await openManagedProfile(managedProfile, [home, path.dirname(INSTALL_ANCHOR)]);
  const inherited = readInheritedProfile(boot, source, INSTALL_ANCHOR, PROFILE_TEMPLATES[managedProfile.profile]);
  await writeInheritedBundle(root, inherited, source);
  const profile = boot.loadProfileDirectory('dsh', root, INSTALL_ANCHOR);
  profile.skippedBundles.push(...inherited.skippedBundles);
  boot.reportSkippedBundles('dsh', profile);
  const { patchFiles: explicitPatchFiles, appArgs } = splitLaunchArguments(args);
  const homePatch = path.join(home, 'cordis.patch.yml');
  const baseLayers = [...profile.layers.map((layer) => layer.patches), profile.patches];
  const rawHome = existsSync(homePatch) ? boot.loadOverlayPatches('dsh', homePatch) : [];
  const homeLayer = existsSync(homePatch) ? originalPatches(boot, homePatch, INSTALL_ANCHOR, inherited.aliases) : [];
  const explicitLayers = explicitPatchFiles.map((file) => originalPatches(boot, file, INSTALL_ANCHOR, inherited.aliases));
  const layers = [...baseLayers, homeLayer, ...explicitLayers];
  const patchFiles = [];
  // runProfile rereads the home layer itself. Correct only transformed assertions/paths,
  // never replay its insertions, before applying the user's ordered explicit overlays.
  const homeCorrections = correctedHomeRows(boot, baseLayers, rawHome, homeLayer);
  if (homeCorrections.length || explicitLayers.length) {
    const filename = path.join(scope, 'user-overlays.patch.yml');
    await privateFile(filename, [...homeCorrections, ...explicitLayers.flat()]);
    patchFiles.push(filename);
  }
  if (flattenEntries(boot.composeEntries(layers)).some((entry) => ['opencodian-native', 'opencodian-header-credentials'].includes(entry.id)))
    throw new Error('Harness inherited configuration replaces a protected bridge row');
  const controlled = composeConfigurationPatches(boot, layers, configuration, managedProfile.profile);
  await applyHeaderCredentialBridge(boot, layers, controlled, headerCredentialRefs, scope);
  if (controlled.length) {
    const filename = path.join(scope, 'configuration.patch.yml');
    await privateFile(filename, controlled);
    patchFiles.push(filename);
  }
  if (managedProfile.profile === 'sdk') patchFiles.push(path.join(scope, 'native.patch.yml'));
  return runProfile({ environment, profile: managedProfile.profile, patchFiles, args: appArgs,
    resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR } });
}
