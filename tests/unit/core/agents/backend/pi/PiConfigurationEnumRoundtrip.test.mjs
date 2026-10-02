import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createConfigurationService, SETTINGS_FIELDS } from '../../../../../../assets/pi/configuration.mjs';

const enumFields = SETTINGS_FIELDS.filter(field => Array.isArray(field.options));
const unknown = 'future-sdk-level';
function valueAt(value, fieldPath) {
  return fieldPath.split('.').reduce((parent, key) => parent?.[key], value);
}
function setAt(value, fieldPath, fieldValue) {
  const parts = fieldPath.split('.'); let parent = value;
  for (const key of parts.slice(0, -1)) { parent[key] ??= {}; parent = parent[key]; }
  parent[parts.at(-1)] = fieldValue;
  return value;
}
function fixture(project = {}, global = {}) {
  const base = process.env.PI_UI_TEST_ARTIFACT_DIR || tmpdir();
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'pi-PC1-'));
  const cwd = join(directory, 'project'); const agentDir = join(directory, 'agent-fixture');
  mkdirSync(join(cwd, '.pi'), { recursive: true }); mkdirSync(agentDir, { recursive: true });
  // Service reads/writes use in-memory locks; backup writes are confined to this owned fixture.
  const raw = { project: JSON.stringify(project), global: JSON.stringify(global) };
  const writes = [];
  class FileSettingsStorage {
    withLock(scope, operation) {
      const result = operation(raw[scope]);
      if (typeof result === 'string') { raw[scope] = result; writes.push({ scope, raw: result }); }
    }
  }
  const config = createConfigurationService({ FileSettingsStorage, VERSION: 'PC1-offline-fixture' }, cwd, agentDir);
  const save = (scope, mode, changes) => {
    const snapshot = config.getSettings();
    const command = { scope, revision: snapshot.scopes[scope].revision };
    if (mode === 'patch') command.changes = changes;
    else {
      command.value = structuredClone(snapshot.scopes[scope].value);
      for (const [fieldPath, replacement] of Object.entries(changes)) setAt(command.value, fieldPath, replacement);
    }
    return config.saveSettings(command);
  };
  return { config, raw, writes, save, cwd, agentDir };
}
function forEachEnum(callback) {
  assert.ok(enumFields.length > 1);
  for (const field of enumFields) for (const scope of ['project', 'global']) for (const mode of ['patch', 'document']) callback(field, scope, mode);
}

test('PC1 reviewer repro: unrelated defaultModel patch preserves stored future-sdk-level', () => {
  const stored = { defaultThinkingLevel: unknown, defaultModel: 'before', future: { opaque: true } };
  const f = fixture(stored);
  const revision = f.config.getSettings().scopes.project.revision;
  const saved = f.config.saveSettings({ scope: 'project', revision, changes: { defaultModel: 'after' } });
  assert.equal(saved.scopes.project.value.defaultModel, 'after');
  assert.equal(saved.scopes.project.value.defaultThinkingLevel, unknown);
  assert.deepEqual(saved.scopes.project.value.future, stored.future);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(f.cwd, '.pi', 'settings.json.opencodian.bak'), 'utf8')), stored);
});
test('every stored schema enum roundtrips unchanged through patch and full document in its own scope', () => {
  forEachEnum((field, scope, mode) => {
    const stored = setAt({ defaultModel: 'before', future: { opaque: ['preserve'] } }, field.path, unknown);
    const f = fixture(scope === 'project' ? stored : {}, scope === 'global' ? stored : {});
    const other = scope === 'project' ? 'global' : 'project'; const otherBefore = f.raw[other];
    const saved = f.save(scope, mode, { defaultModel: 'after' });
    assert.equal(valueAt(saved.scopes[scope].value, field.path), unknown, field.path + ' ' + scope + ' ' + mode);
    assert.equal(saved.scopes[scope].value.defaultModel, 'after');
    assert.deepEqual(saved.scopes[scope].value.future, stored.future);
    assert.equal(f.raw[other], otherBefore);
    assert.equal(f.writes.length, 1);
  });
});
test('every schema enum rejects introducing or changing unsupported values without any write', () => {
  forEachEnum((field, scope, mode) => {
    for (const baseline of [undefined, field.options[0], unknown]) {
      const stored = baseline === undefined ? {} : setAt({}, field.path, baseline);
      const f = fixture(scope === 'project' ? stored : {}, scope === 'global' ? stored : {}); const before = f.raw[scope];
      const candidate = baseline === unknown ? 'another-future-value' : unknown;
      assert.throws(() => f.save(scope, mode, { [field.path]: candidate }), /unsupported value/, field.path);
      assert.equal(f.raw[scope], before); assert.equal(f.writes.length, 0);
    }
  });
});
test('every schema enum can replace a stored unknown value with a supported value', () => {
  forEachEnum((field, scope, mode) => {
    const stored = setAt({}, field.path, unknown);
    const f = fixture(scope === 'project' ? stored : {}, scope === 'global' ? stored : {});
    const saved = f.save(scope, mode, { [field.path]: field.options[0] });
    assert.equal(valueAt(saved.scopes[scope].value, field.path), field.options[0]);
    assert.equal(f.writes.length, 1);
  });
});
test('every schema enum still rejects stored or new type errors rather than grandfathering them', () => {
  forEachEnum((field, scope, mode) => {
    const stored = setAt({}, field.path, 42);
    const f = fixture(scope === 'project' ? stored : {}, scope === 'global' ? stored : {}); const before = f.raw[scope];
    assert.throws(() => f.save(scope, mode, { defaultModel: 'after' }), /expected text/);
    assert.equal(f.raw[scope], before); assert.equal(f.writes.length, 0);
    const empty = fixture();
    assert.throws(() => empty.save(scope, mode, { [field.path]: 42 }), /expected text/);
    assert.equal(empty.writes.length, 0);
  });
});
test('scope isolation rejects a new unknown enum even when the other scope already stores it', () => {
  forEachEnum((field, scope, mode) => {
    const stored = setAt({}, field.path, unknown);
    const f = fixture(scope === 'global' ? stored : {}, scope === 'project' ? stored : {});
    assert.throws(() => f.save(scope, mode, { [field.path]: unknown }), /unsupported value/);
    assert.equal(f.writes.length, 0);
  });
});
test('revision conflict remains fail closed while a stored enum is unknown', () => {
  const f = fixture({ defaultThinkingLevel: unknown }); const before = f.raw.project;
  assert.throws(() => f.config.saveSettings({ scope: 'project', revision: 'stale', changes: { defaultModel: 'after' } }), /changed on disk/);
  assert.equal(f.raw.project, before); assert.equal(f.writes.length, 0);
});
test('unsafe nested keys remain fail closed while an enum is unchanged', () => {
  const f = fixture({ defaultThinkingLevel: unknown }); const snapshot = f.config.getSettings();
  const value = JSON.parse('{"defaultThinkingLevel":"future-sdk-level","future":{"__proto__":{"polluted":true}}}');
  assert.throws(() => f.config.saveSettings({ scope: 'project', revision: snapshot.scopes.project.revision, value }), /Unsafe configuration key/);
  assert.equal(f.writes.length, 0); assert.equal({}.polluted, undefined);
});
test('deleting an unknown stored enum and adding a supported one succeeds', () => {
  const f = fixture({ defaultThinkingLevel: unknown });
  let snapshot = f.config.getSettings();
  snapshot = f.config.saveSettings({ scope: 'project', revision: snapshot.scopes.project.revision, changes: { defaultThinkingLevel: null } });
  assert.equal(Object.hasOwn(snapshot.scopes.project.value, 'defaultThinkingLevel'), false);
  snapshot = f.config.saveSettings({ scope: 'project', revision: snapshot.scopes.project.revision, changes: { defaultThinkingLevel: 'low' } });
  assert.equal(snapshot.scopes.project.value.defaultThinkingLevel, 'low');
});
