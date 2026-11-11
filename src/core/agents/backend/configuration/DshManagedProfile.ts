import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveDefaultTraceDirectory } from '../../../../shared/diagnostics/TraceRedactor';
import type { DshAcpClientOptions, DshLaunchSpec } from '../dsh/DshAcpClient';
import { buildDshNativeConfigurationEntries, dshNativeConfigurationRevision, validateDshNativeConfiguration } from './DshNativeConfiguration';

declare const DSH_NATIVE_SERVICE_SOURCE: string;

/** The durable directory is deliberately not part of the launch cleanup contract. */
export interface DshManagedProfileLocation {
  readonly root: string;
  readonly allowedRoot: string;
  readonly vaultHash: string;
  readonly profile: 'sdk' | 'acp';
}

/** Canonicalize the existing ancestor, without creating machine-local storage in the host process. */
function canonicalFuturePath(filename: string): string {
  const suffix: string[] = [];
  let current = path.resolve(filename);
  while (!existsSync(current)) {
    suffix.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Harness managed profile has no canonical parent');
    current = parent;
  }
  return path.join(realpathSync(current), ...suffix);
}

export function resolveDshManagedProfile(options: Pick<DshAcpClientOptions, 'vaultPath' | 'cwd' | 'managedProfileRoot'>,
  profile: 'sdk' | 'acp'): DshManagedProfileLocation {
  const vault = realpathSync(options.vaultPath ?? options.cwd);
  const vaultHash = createHash('sha256').update(vault).digest('hex');
  // Reuse the host's userData/platform selection, keeping dependencies out of the synced vault.
  const defaultRoot = path.join(resolveDefaultTraceDirectory('dsh'), '..', '..', 'dsh', 'profiles');
  const allowedRoot = canonicalFuturePath(options.managedProfileRoot ?? defaultRoot);
  if (allowedRoot === vault || allowedRoot.startsWith(vault + path.sep) || vault.startsWith(allowedRoot + path.sep))
    throw new Error('Harness managed profiles must be outside the vault');
  return { root: path.join(allowedRoot, vaultHash, profile), allowedRoot, vaultHash, profile };
}

/** Prepare private bridge files; the child launcher owns creation and guarding of durable profile files. */
export async function prepareDshManagedLaunch(options: DshAcpClientOptions, baseLaunch: DshLaunchSpec,
  profile: 'sdk' | 'acp', onScope: (scope: string) => void): Promise<void> {
  const validated = validateDshNativeConfiguration(options.nativeConfig);
  const configuration = buildDshNativeConfigurationEntries(validated);
  const nativeConfigRevision = dshNativeConfigurationRevision(validated);
  const headerCredentialRefs = Object.fromEntries(Object.entries(validated.overrides['llm-pi-ai']?.providers ?? {})
    .filter(([, provider]) => Object.keys(provider.headerCredentialRefs ?? {}).length)
    .map(([provider, config]) => [provider, config.headerCredentialRefs]));
  const args = [...baseLaunch.args];
  const profileIndex = args.indexOf('--profile');
  if (profileIndex < 0 || args[profileIndex + 1] !== 'acp') throw new Error('Harness launcher is missing its ACP profile argument');
  const nativeAnchor = profileIndex > 0 ? realpathSyncIfPresent(args[0]) : realpathSync(baseLaunch.command);
  const managedProfile = resolveDshManagedProfile(options, profile);
  const scope = await mkdtemp(path.join(os.tmpdir(), 'opencodian-dsh-'));
  onScope(scope);
  const service = path.join(scope, 'service.mjs');
  const launcher = path.join(scope, 'launcher.mjs');
  await writeFile(service, DSH_NATIVE_SERVICE_SOURCE, { mode: 0o600 });
  if (profile === 'sdk') {
    await writeFile(path.join(scope, 'native.patch.yml'), JSON.stringify([
      { id: 'sdk-jsonrpc-server', disabled: true },
      { insert: [{ id: 'opencodian-native', name: service, inject: ['sdkAppStartup', 'loader'],
        config: { nativeAnchor, managedProfileRoot: managedProfile.root, nativeConfigRevision } }] },
    ]), { mode: 0o600 });
  }
  await writeFile(launcher, `import { launchNativeRuntime } from './service.mjs';\nawait launchNativeRuntime(${JSON.stringify({
    nativeAnchor, scope, args: args.slice(profileIndex + 2), managedProfile, configuration, headerCredentialRefs,
  })});\n`, { mode: 0o600 });
  // External Node, not Obsidian's embedding Electron executable, hosts npm CLIs.
  options.launch.command = profileIndex > 0 ? baseLaunch.command : 'node';
  options.launch.env.ELECTRON_RUN_AS_NODE = '1';
  options.launch.args.splice(0, options.launch.args.length, launcher);
}

function realpathSyncIfPresent(filename: string): string {
  return existsSync(filename) ? realpathSync(filename) : path.resolve(filename);
}

/** Only the files allocated by prepareDshManagedLaunch; never accepts a managed profile path. */
export async function releaseDshLaunchScope(scope: string): Promise<void> {
  for (const file of ['service.mjs', 'native.patch.yml', 'configuration.patch.yml', 'user-overlays.patch.yml', 'header-credentials.mjs', 'launcher.mjs']) {
    await unlink(path.join(scope, file)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
  await rmdir(scope);
}
