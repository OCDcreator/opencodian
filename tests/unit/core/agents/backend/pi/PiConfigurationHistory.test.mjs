import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createConfigurationService } from '../../../../../../assets/pi/configuration.mjs';

const POSIX = process.platform !== 'win32';
const PROVIDERS = { providers: { lab: { apiKey: 'sk-history-secret-expression', models: [{ id: 'lab-large' }] } } };

function walkPaths(node) {
  if (!existsSync(node)) return [];
  if (!lstatSync(node).isDirectory()) return [node];
  return [node, ...readdirSync(node).flatMap(child => walkPaths(join(node, child)))];
}

function fixture(initialModels) {
  const base = process.env.PI_UI_TEST_ARTIFACT_DIR || tmpdir();
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'pi-history-'));
  const cwd = join(directory, 'project');
  const agentDir = join(directory, 'agent-fixture');
  const historyRoot = join(directory, 'history-root');
  mkdirSync(join(cwd, '.pi'), { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  const files = { project: join(cwd, '.pi', 'settings.json'), global: join(agentDir, 'settings.json'), models: join(agentDir, 'models.json') };
  class FileSettingsStorage {
    withLock(scope, operation) {
      let raw; try { raw = readFileSync(files[scope], 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const next = operation(raw); if (typeof next === 'string') writeFileSync(files[scope], next);
    }
  }
  const sdk = {
    FileSettingsStorage,
    VERSION: 'offline-history-fixture',
    AuthStorage: { inMemory: () => ({}) },
    // Offline stand-in for the real registry validation: same call shape, no network.
    ModelRegistry: { create: () => ({ getError: () => null }) },
  };
  if (initialModels !== undefined) writeFileSync(files.models, JSON.stringify(initialModels, null, 2) + '\n', { mode: 0o600 });
  const options = { historyRoot };
  return { directory, cwd, agentDir, historyRoot, files, sdk, options, config: createConfigurationService(sdk, cwd, agentDir, options), build: () => createConfigurationService(sdk, cwd, agentDir, options) };
}

function saveGlobalSettings(config, model) {
  const snapshot = config.getSettings();
  return config.saveSettings({ scope: 'global', revision: snapshot.scopes.global.revision, changes: { defaultModel: model } });
}

async function saveModels(config, label) {
  const snapshot = config.getModels();
  const value = Object.keys(snapshot.value).length ? structuredClone(snapshot.value) : structuredClone(PROVIDERS);
  value.providers ??= { lab: {} };
  value.providers.lab ??= {};
  value.providers.lab.defaultModel = label;
  return config.saveModels({ revision: snapshot.revision, value });
}

function historyDirectoryFor(historyRoot, root) {
  const base = existsSync(historyRoot) ? realpathSync(historyRoot) : historyRoot;
  const rootPath = existsSync(root) ? realpathSync(root) : root;
  return join(base, createHash('sha256').update(rootPath).digest('hex'));
}

function slotPath(historyRoot, root, key, index) {
  return join(historyDirectoryFor(historyRoot, root), `${key}-${index}.json`);
}

function assertSlotModes(historyRoot, root, key) {
  if (!POSIX) return;
  const directory = historyDirectoryFor(historyRoot, root);
  assert.equal(lstatSync(directory).mode & 0o777, 0o700, 'history directory mode');
  for (let index = 1; index <= 5; index += 1) {
    const file = join(directory, `${key}-${index}.json`);
    if (existsSync(file)) assert.equal(lstatSync(file).mode & 0o777, 0o600, `${file} mode`);
  }
}

test('settings saves rotate bounded slots beside the machine-global home, never inside the project tree', () => {
  const f = fixture();
  for (const model of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']) saveGlobalSettings(f.config, model);
  for (let index = 1; index <= 5; index += 1) assert.ok(existsSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', index)), `slot ${index}`);
  assert.ok(!existsSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', 6)), 'bounded at five slots');
  // First save archives nothing (absent file); slot-1 = state before save 7, slot-5 = before save 3.
  assert.equal(JSON.parse(readFileSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', 1), 'utf8')).defaultModel, 'm6');
  assert.equal(JSON.parse(readFileSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', 5), 'utf8')).defaultModel, 'm2');
  // No history slots anywhere under the project (vault) subtree.
  const vaultPaths = walkPaths(f.cwd);
  assert.ok(vaultPaths.length > 0);
  for (const path of vaultPaths) assert.ok(!path.includes('history-root'), `history leaked into vault: ${path}`);
  assert.ok(!vaultPaths.some(path => path.includes('settings-global-')), 'global history stayed out of the vault');
  assertSlotModes(f.historyRoot, f.agentDir, 'settings-global');
});

test('history survives a full service rebuild (page reopen / app reload)', () => {
  const f = fixture();
  saveGlobalSettings(f.config, 'before-reload');
  saveGlobalSettings(f.config, 'after-reload');
  const listed = f.config.getConfigurationHistory();
  assert.equal(listed.settings.global.entries.length, 1);
  const rebuilt = f.build().getConfigurationHistory();
  assert.deepEqual(rebuilt.settings.global.entries, listed.settings.global.entries);
  assert.equal(rebuilt.settings.global.entries[0].index, 1);
  assert.equal(typeof rebuilt.settings.global.entries[0].savedAt, 'number');
  // Metadata identity matches the actual archived bytes.
  const raw = readFileSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', 1), 'utf8');
  assert.equal(rebuilt.settings.global.entries[0].revision, createHash('sha256').update(raw).digest('hex'));
  assert.equal(rebuilt.settings.global.entries[0].bytes, Buffer.byteLength(raw));
});

test('settings restore is a CAS roundtrip that archives the displaced current state', () => {
  const f = fixture();
  saveGlobalSettings(f.config, 'good');
  saveGlobalSettings(f.config, 'broken');
  // slot-1 holds the pre-'broken' state ('good').
  assert.equal(JSON.parse(readFileSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', 1), 'utf8')).defaultModel, 'good');
  const history = f.config.getConfigurationHistory();
  assert.equal(history.settings.global.entries.length, 1);
  const entry = history.settings.global.entries[0];
  const restored = f.config.restoreConfiguration({
    target: 'settings', scope: 'global', index: entry.index, archivedRevision: entry.revision, revision: f.config.getSettings().scopes.global.revision,
  });
  assert.equal(restored.scopes.global.value.defaultModel, 'good');
  assert.equal(JSON.parse(readFileSync(f.files.global, 'utf8')).defaultModel, 'good');
  // The displaced 'broken' state is itself archived for undo-of-undo.
  assert.equal(f.config.getConfigurationHistory().settings.global.entries.length, 2);
  assert.equal(JSON.parse(readFileSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', 1), 'utf8')).defaultModel, 'broken');
});

test('restore fails closed on stale CAS, wrong archive identity, and bad index without mutating anything', () => {
  const f = fixture();
  saveGlobalSettings(f.config, 'good');
  saveGlobalSettings(f.config, 'broken');
  const history = f.config.getConfigurationHistory();
  const entry = history.settings.global.entries[0];
  const before = readFileSync(f.files.global, 'utf8');
  const slotBefore = readFileSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', 1), 'utf8');
  const current = () => f.config.getSettings().scopes.global.revision;

  assert.throws(() => f.config.restoreConfiguration({
    target: 'settings', scope: 'global', index: entry.index, archivedRevision: entry.revision, revision: 'stale-revision',
  }), /changed on disk/);
  assert.throws(() => f.config.restoreConfiguration({
    target: 'settings', scope: 'global', index: entry.index, archivedRevision: createHash('sha256').update('other-bytes').digest('hex'), revision: current(),
  }), /Archived snapshot no longer matches/);
  assert.throws(() => f.config.restoreConfiguration({
    target: 'settings', scope: 'global', index: 4, archivedRevision: entry.revision, revision: current(),
  }), /Choose a stored history slot/);
  assert.throws(() => f.config.restoreConfiguration({ target: 'settings', index: 1, archivedRevision: entry.revision, revision: 'x' }), /Choose global or project scope/);
  assert.throws(() => f.config.restoreConfiguration({ target: 'providers', scope: 'global', index: 1, archivedRevision: entry.revision, revision: current() }), /Choose models or settings/);
  assert.equal(readFileSync(f.files.global, 'utf8'), before);
  assert.equal(readFileSync(slotPath(f.historyRoot, f.agentDir, 'settings-global', 1), 'utf8'), slotBefore);
});

test('models history roundtrip keeps secrets out of the vault, preserves .bak, and validates on restore', async () => {
  const f = fixture(PROVIDERS);
  await saveModels(f.config, 'large');
  await saveModels(f.config, 'small');
  const history = f.config.getConfigurationHistory();
  assert.equal(history.models.entries.length, 2);
  assert.equal(history.models.path, f.files.models);
  // Secret-bearing snapshots live only under the machine-global history root.
  assert.ok(readFileSync(slotPath(f.historyRoot, f.agentDir, 'models', 1), 'utf8').includes('sk-history-secret-expression'));
  assertSlotModes(f.historyRoot, f.agentDir, 'models');
  if (POSIX) assert.equal(lstatSync(f.files.models).mode & 0o777, 0o600);
  assert.ok(existsSync(`${f.files.models}.opencodian.bak`), 'backward-compatible .bak retained');

  const entry = history.models.entries.find(candidate => candidate.index === 1);
  const restored = await f.config.restoreConfiguration({
    target: 'models', index: entry.index, archivedRevision: entry.revision, revision: f.config.getModels().revision,
  });
  assert.equal(restored.value.providers.lab.defaultModel, 'large');
  assert.equal(JSON.parse(readFileSync(f.files.models, 'utf8')).providers.lab.defaultModel, 'large');
  // The displaced current state was archived too.
  assert.equal(JSON.parse(readFileSync(slotPath(f.historyRoot, f.agentDir, 'models', 1), 'utf8')).providers.lab.defaultModel, 'small');
  // CAS and identity guards hold for models as well. Restore rotated the whole
  // stack, so slot 3 now holds the initial snapshot and index 6 is out of range.
  await assert.rejects(() => f.config.restoreConfiguration({
    target: 'models', index: entry.index, archivedRevision: entry.revision, revision: 'stale',
  }), /changed on disk/);
  await assert.rejects(() => f.config.restoreConfiguration({
    target: 'models', index: 3, archivedRevision: entry.revision, revision: f.config.getModels().revision,
  }), /Archived snapshot no longer matches/);
  await assert.rejects(() => f.config.restoreConfiguration({
    target: 'models', index: 6, archivedRevision: entry.revision, revision: f.config.getModels().revision,
  }), /Choose a stored history slot/);
  await assert.rejects(() => f.config.restoreConfiguration({
    target: 'models', index: entry.index, archivedRevision: 'deadbeef', revision: f.config.getModels().revision,
  }), /Archived snapshot no longer matches/);
});

if (POSIX) test('symlinked or escaping history slots are ignored by listings and rejected on restore', () => {
  const f = fixture();
  saveGlobalSettings(f.config, 'good');
  saveGlobalSettings(f.config, 'broken');
  const outside = join(f.directory, 'outside-target.json');
  writeFileSync(outside, '{"defaultModel":"attacker"}\n');
  const slot = slotPath(f.historyRoot, f.agentDir, 'settings-global', 1);
  rmSync(slot);
  symlinkSync(outside, slot);
  const listed = f.config.getConfigurationHistory();
  assert.ok(!listed.settings.global.entries.some(entry => entry.index === 1), 'symlink slot never listed');
  assert.throws(() => f.config.restoreConfiguration({
    target: 'settings', scope: 'global', index: 1, archivedRevision: createHash('sha256').update('{"defaultModel":"attacker"}\n').digest('hex'), revision: f.config.getSettings().scopes.global.revision,
  }), /Choose a stored history slot/);
  assert.equal(readFileSync(f.files.global, 'utf8').includes('attacker'), false);
  // Writing the next snapshot replaces the symlink slot atomically instead of following it.
  saveGlobalSettings(f.config, 'recovered');
  assert.equal(lstatSync(slot).isSymbolicLink(), false);
  assert.equal(JSON.parse(readFileSync(slot, 'utf8')).defaultModel, 'broken');
  assert.equal(readFileSync(outside, 'utf8'), '{"defaultModel":"attacker"}\n');
});

test('custom agent dirs inside the vault still archive under the machine-global home', () => {
  const base = process.env.PI_UI_TEST_ARTIFACT_DIR || tmpdir();
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'pi-history-vault-'));
  const cwd = join(directory, 'project');
  const agentDir = join(cwd, '.pi-agent');
  const historyRoot = join(directory, 'history-root');
  mkdirSync(agentDir, { recursive: true });
  class FileSettingsStorage {
    withLock(_scope, operation) {
      let raw; try { raw = readFileSync(join(agentDir, 'settings.json'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const next = operation(raw); if (typeof next === 'string') writeFileSync(join(agentDir, 'settings.json'), next);
    }
  }
  const config = createConfigurationService({ FileSettingsStorage, VERSION: 'offline-history-fixture' }, cwd, agentDir, { historyRoot });
  const snapshot = config.getSettings();
  config.saveSettings({ scope: 'global', revision: snapshot.scopes.global.revision, changes: { defaultModel: 'first' } });
  const second = config.getSettings();
  config.saveSettings({ scope: 'global', revision: second.scopes.global.revision, changes: { defaultModel: 'vault-agent' } });
  assert.ok(existsSync(join(historyDirectoryFor(historyRoot, agentDir), 'settings-global-1.json')), 'history under machine-global root');
  assert.ok(realpathSync(historyRoot).startsWith(realpathSync(directory)), 'history root stayed in the injected temp home');
  for (const path of walkPaths(cwd)) assert.ok(!path.includes('history-root'), `history leaked into vault: ${path}`);
});
