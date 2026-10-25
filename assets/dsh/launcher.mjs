import { createRequire } from 'node:module';
import { copyFile, readFile, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Boot the installed runtime against an application-owned profile snapshot. */
export async function launchNativeRuntime({ nativeAnchor, scope, args }) {
  const requireNative = createRequire(nativeAnchor);
  const load = async (name) => import(pathToFileURL(requireNative.resolve(name)).href);
  const { loadLayeredEnv, loadProfileDirectory, loadOverlayPatches, PROFILE_TEMPLATES } = await load('@deepseek-ai/dsh-app-boot');
  const { resolveDshHome } = await load('@deepseek-ai/dsh-home-paths');
  const { runProfile, INSTALL_ANCHOR } = await import(pathToFileURL(path.join(path.dirname(nativeAnchor), 'profile-boot.js')).href);
  const environment = loadLayeredEnv('dsh');
  const source = path.join(resolveDshHome(), 'profiles', 'sdk');
  const manifest = path.join(source, 'package.json');
  await writeFile(path.join(scope, 'package.json'), existsSync(manifest) ? await readFile(manifest)
    : JSON.stringify({ name: 'opencodian-dsh-runtime', private: true, dependencies: {}, dsh: { profile: PROFILE_TEMPLATES.sdk } }), { mode: 0o600 });
  if (existsSync(path.join(source, 'compatibility.json')))
    await copyFile(path.join(source, 'compatibility.json'), path.join(scope, 'compatibility.json'));
  if (existsSync(path.join(source, 'node_modules')))
    await symlink(path.join(source, 'node_modules'), path.join(scope, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const profile = loadProfileDirectory('dsh', scope, INSTALL_ANCHOR, { userLayer: false });
  // Parse at the original location so relative plugin paths retain their base URL.
  const sourcePatch = path.join(source, 'cordis.patch.yml');
  if (existsSync(sourcePatch)) profile.patches = loadOverlayPatches('dsh', sourcePatch);
  const patchFiles = [];
  const appArgs = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--patch') {
      if (!args[index + 1]) throw new Error('Harness --patch requires a filename');
      patchFiles.push(args[++index]);
    } else if (args[index].startsWith('--patch=')) patchFiles.push(args[index].slice('--patch='.length));
    else if (args[index].startsWith('--from-default-profile')) throw new Error('OpenCodian cannot replace a Harness user profile');
    else appArgs.push(args[index]);
  }
  patchFiles.push(path.join(scope, 'native.patch.yml'));
  await runProfile({ environment, profile: 'sdk', patchFiles, args: appArgs,
    resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR } });
}
