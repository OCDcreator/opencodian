import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { DshAcpClient } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import type { DshBackendSettings } from '../../../../../src/core/types/settings';

const live = process.env.RUN_DSH_ACP_DEFAULTS_LIVE === '1' ? describe : describe.skip;

/** Public installed ACP and a catalog-only provider; every model dispatch fails and leaves evidence. */
function fixture() {
  const installation = process.env.DSH_PUBLIC_INSTALL;
  if (!installation || !existsSync(path.join(installation, 'lib', 'bin.js')))
    throw new Error('RUN_DSH_ACP_DEFAULTS_LIVE requires DSH_PUBLIC_INSTALL pointing to the public DSH package');
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'opencodian-dsh-acp-defaults-')));
  const profiles = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'opencodian-dsh-acp-default-profiles-')));
  const source = path.join(directory, 'home', 'profiles', 'acp');
  mkdirSync(source, { recursive: true, mode: 0o700 });
  const anchor = path.join(installation, 'lib', 'bin.js');
  const llmModule = pathToFileURL(createRequire(anchor).resolve('@deepseek-ai/dsh-llm')).href;
  const attemptedModelCall = path.join(directory, 'forbidden-model-dispatch');
  writeFileSync(path.join(source, 'offline-provider.mjs'), `import { LlmAdapter } from ${JSON.stringify(llmModule)};
    import { writeFileSync } from 'node:fs';
    class OfflineProvider extends LlmAdapter {
      async listModels(provider) { return ['inherited-model','saved-model'].map(id => ({provider,id,name:id,inputModalities:['text']})); }
      async resolveModel(provider, model) { return {provider,id:model,name:model,inputModalities:['text'],context:{contextWindow:32000},
        reasoning:{efforts:[{id:'low',name:'Low'},{id:'high',name:'High'}],defaultEffort:'low'}}; }
      async *stream() { writeFileSync(${JSON.stringify(attemptedModelCall)}, 'attempted'); throw new Error('Offline ACP fixture forbids model requests'); }
    }
    export const inject=['llm'];
    export async function apply(ctx) { ctx.llm.registerAdapter(['inherited-acp','saved-provider','base-agent'], new OfflineProvider()); }
  `, { mode: 0o600 });
  writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'owned-acp-defaults-profile', private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app'] } } }), { mode: 0o600 });
  writeFileSync(path.join(source, 'cordis.patch.yml'), JSON.stringify([
    { id: 'llm-deepseek', disabled: true }, { id: 'llm-pi-ai', disabled: true },
    { insert: [{ id: 'offline-provider', name: './offline-provider.mjs', inject: ['llm'] }] },
    { id: 'agent-default-model', config: { provider: 'base-agent', model: 'saved-model' } },
    { id: 'acp', name: '@deepseek-ai/dsh-acp', config: { provider: 'inherited-acp', model: 'inherited-model', sessionListPageSize: 7 } },
  ]), { mode: 0o600 });
  const settings: DshBackendSettings = { executablePath: anchor, workingDirectory: directory, args: [], env: {}, profile: 'acp', transport: 'acp',
    nativeConfig: { version: 1, overrides: { 'agent-default-model': { provider: 'saved-provider', model: 'saved-model', reasoningEffort: 'high' } } } };
  const adapter = new DshAdapter({ workingDirectory: directory, getSettings: () => settings,
    createClient: (options) => new DshAcpClient({ ...options, managedProfileRoot: profiles }),
    getExtraEnv: () => ({ HOME: directory, DSH_HOME: path.join(directory, 'home'), DSH_TELEMETRY_DISABLED: '1',
      XDG_CONFIG_HOME: path.join(directory, '.config'), XDG_DATA_HOME: path.join(directory, '.local', 'share') }),
  });
  return { adapter, settings, attemptedModelCall };
}

live('installed ACP saved defaults through the real adapter (zero model requests)', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'DSH_NATIVE_SERVICE_SOURCE');
  beforeAll(() => {
    // ACP only needs the launcher export. Import the owned source directly; no bundle/build/deploy runs.
    const launcher = pathToFileURL(path.resolve(__dirname, '../../../../../assets/dsh/launcher.mjs')).href;
    Object.defineProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE', { value: `export { launchNativeRuntime } from ${JSON.stringify(launcher)};`, configurable: true });
  });
  afterAll(() => {
    if (descriptor) Object.defineProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE', descriptor);
    else Reflect.deleteProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE');
  });

  it('applies saved route/high effort only to new sessions, preserves explicit low on resume, and resets inherited defaults', async () => {
    const { adapter, settings, attemptedModelCall } = fixture();
    const read = async (id: string) => Object.fromEntries((await adapter.readSessionConfiguration(id)).configOptions.map((option) => [option.id, option.currentValue]));
    try {
      const first = await adapter.createSession();
      await expect(read(first)).resolves.toMatchObject({ model: JSON.stringify(['saved-provider', 'saved-model']), reasoning_effort: 'high' });
      await adapter.setSessionConfigOption(first, 'reasoning_effort', 'low');
      await expect(read(first)).resolves.toMatchObject({ reasoning_effort: 'low' });
      await adapter.stop();

      // The persisted default still requests high. A resumed session must retain its explicit low.
      await expect(read(first)).resolves.toMatchObject({ model: JSON.stringify(['saved-provider', 'saved-model']), reasoning_effort: 'low' });
      const second = await adapter.createSession();
      await expect(read(second)).resolves.toMatchObject({ model: JSON.stringify(['saved-provider', 'saved-model']), reasoning_effort: 'high' });
      await adapter.stop();

      settings.nativeConfig = { version: 1, overrides: {} };
      const inherited = await adapter.createSession();
      await expect(read(inherited)).resolves.toMatchObject({ model: JSON.stringify(['inherited-acp', 'inherited-model']), reasoning_effort: 'low' });
      await expect(read(first)).resolves.toMatchObject({ model: JSON.stringify(['saved-provider', 'saved-model']), reasoning_effort: 'low' });
    } finally { await adapter.stop(); }
    expect(existsSync(attemptedModelCall)).toBe(false);
  }, 45_000);
});
