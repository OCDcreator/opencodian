import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { executeCommand } from '../../../../../../assets/pi/commands.mjs';
import { createConfigurationService } from '../../../../../../assets/pi/configuration.mjs';

function fixture() {
  const base = process.env.PI_UI_TEST_ARTIFACT_DIR || tmpdir();
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'pi-schema-roundtrip-'));
  const cwd = join(dir, 'project'); const agentDir = join(dir, 'agent-fixture');
  mkdirSync(join(cwd, '.pi'), { recursive: true }); mkdirSync(agentDir, { recursive: true });
  const files = { project: join(cwd, '.pi', 'settings.json'), global: join(agentDir, 'settings.json') };
  class FileSettingsStorage {
    withLock(scope, operation) {
      let raw; try { raw = readFileSync(files[scope], 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const next = operation(raw); if (typeof next === 'string') writeFileSync(files[scope], next);
    }
  }
  const value = { defaultThinkingLevel: 'max', futureTop: { values: ['opaque', 42], flag: true }, compaction: { reserveTokens: 10, futureNested: { extra: 'preserve' } }, retry: { provider: { futureProvider: { allow: true } } } };
  writeFileSync(files.project, JSON.stringify(value) + '\n');
  writeFileSync(files.global, '{"futureGlobal":{"untouched":true}}\n');
  return { config: createConfigurationService({ FileSettingsStorage, VERSION: 'offline-schema-fixture' }, cwd, agentDir), value, files };
}

test('max is accepted by the dispatch validator and returned as the actual session level', async () => {
  const session = { modelRegistry: {}, sessionManager: {}, thinkingLevel: 'off', setThinkingLevel(value) { this.thinkingLevel = value; } };
  const result = await executeCommand({ sdk: {}, auth: {}, runtime: { session } }, { type: 'set_thinking_level', level: 'max' });
  assert.deepEqual(result, { level: 'max' });
  await assert.rejects(executeCommand({ sdk: {}, auth: {}, runtime: { session } }, { type: 'set_thinking_level', level: 'not-a-level' }), /Invalid thinking level/);
});
test('schema reports max and differential save preserves unknown top-level/nested fields plus max', () => {
  const { config, value, files } = fixture(); const before = config.getSettings();
  assert.ok(before.fields.find(field => field.path === 'defaultThinkingLevel').options.includes('max'));
  const globalBefore = readFileSync(files.global, 'utf8');
  const saved = config.saveSettings({ scope: 'project', revision: before.scopes.project.revision, changes: { 'compaction.reserveTokens': 456 } });
  assert.equal(saved.scopes.project.value.defaultThinkingLevel, 'max');
  assert.deepEqual(saved.scopes.project.value.futureTop, value.futureTop);
  assert.deepEqual(saved.scopes.project.value.compaction.futureNested, value.compaction.futureNested);
  assert.deepEqual(saved.scopes.project.value.retry.provider, value.retry.provider);
  assert.equal(saved.scopes.project.value.compaction.reserveTokens, 456);
  assert.equal(readFileSync(files.global, 'utf8'), globalBefore);
  assert.deepEqual(JSON.parse(readFileSync(files.project, 'utf8')), saved.scopes.project.value);
});
test('full-document advanced save roundtrips unknown fields and max', () => {
  const { config, files, value } = fixture(); const before = config.getSettings();
  const edited = { ...before.scopes.project.value, defaultModel: 'new-model', futureAdded: { nativeOnly: ['keep'] } };
  const after = config.saveSettings({ scope: 'project', revision: before.scopes.project.revision, value: edited });
  assert.deepEqual(after.scopes.project.value, edited);
  assert.deepEqual(after.scopes.project.value.futureTop, value.futureTop);
  assert.deepEqual(JSON.parse(readFileSync(files.project, 'utf8')), edited);
});
test('revision conflict and invalid known values fail without replacing the persisted unknown fields', () => {
  const { config, files } = fixture(); const before = config.getSettings(); const raw = readFileSync(files.project, 'utf8');
  assert.throws(() => config.saveSettings({ scope: 'project', revision: 'stale-revision', changes: { defaultModel: 'wrong' } }), /changed on disk/);
  assert.throws(() => config.saveSettings({ scope: 'project', revision: before.scopes.project.revision, changes: { defaultThinkingLevel: 'not-a-level' } }), /unsupported value/);
  assert.equal(readFileSync(files.project, 'utf8'), raw);
});

test('modern OAuth receives the installation device ID callback and keeps cancellation separate', async () => {
  const getDeviceId = () => '29dddf8f-78c8-4f07-8c62-314f183ace48';
  let calls = 0;
  const host = { sdk: {}, runtime: { session: { modelRegistry: {}, sessionManager: {} } }, auth: {}, getDeviceId,
    ui: {}, modelRuntime: { async login(provider, method, interaction, options) {
      calls += 1;
      assert.equal(provider, 'openai');
      assert.equal(method, 'oauth');
      assert.equal(options?.getDeviceId, getDeviceId);
      assert.equal(options.getDeviceId(), getDeviceId());
      assert.equal(interaction.signal.aborted, false);
      throw new Error('Login cancelled');
    } } };
  await assert.rejects(executeCommand(host, { type: 'login', provider: 'openai' }), /Login cancelled/);
  assert.equal(calls, 1);
  assert.equal(host.loginAbort, undefined);
});
test('minimum OAuth keeps the original AuthStorage login callback interface', async () => {
  let calls = 0;
  const host = { sdk: {}, runtime: { session: { modelRegistry: {}, sessionManager: {} } },
    auth: { async login(provider, callbacks) { calls += 1; assert.equal(provider, 'openai-codex'); assert.ok(callbacks.signal); } }, ui: {} };
  assert.deepEqual(await executeCommand(host, { type: 'login', provider: 'openai-codex' }), { authenticated: true });
  assert.equal(calls, 1);
  assert.equal(host.loginAbort, undefined);
});

test('OAuth settlement cancels the exact authorization URL notice', async () => {
  const events = [];
  const host = { sdk: {}, runtime: { session: { modelRegistry: {}, sessionManager: {} } },
    auth: { async login() { throw new Error('Cancelled'); } }, ui: {}, send: event => events.push(event) };
  await assert.rejects(executeCommand(host, { type: 'login', provider: 'openai-codex' }), /Cancelled/);
  assert.deepEqual(events, [{ type: 'extension_ui_cancel', id: 'oauth-link' }]);
});

test('modern OAuth forwards an entered empty text value and distinguishes cancelled UI', async () => {
  const host = { sdk: {}, runtime: { session: { modelRegistry: {}, sessionManager: {} } }, auth: {},
    ui: { async ask() { return ''; } }, modelRuntime: { async login(_provider, _method, interaction) {
      assert.equal(await interaction.prompt({ type: 'text', message: 'blank selects default' }), '');
    } } };
  assert.deepEqual(await executeCommand(host, { type: 'login', provider: 'github-copilot' }), { authenticated: true });
  host.ui.ask = async () => undefined;
  await assert.rejects(executeCommand(host, { type: 'login', provider: 'github-copilot' }), /Login cancelled/);
});
