/** Real files prove revision conflicts, preservation and native write boundaries. */
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { ZCodePersonalConfigService, type ZCodeProviderDraft } from '../../../../../src/core/agents/backend/zcode/ZCodePersonalConfigService';

const draft: ZCodeProviderDraft = {
  name: 'Test API', protocol: 'openai-chat-completions', baseUrl: 'https://example.invalid/v1', apiKey: 'fixture-key', models: ['fixture-model'],
};

async function fixture() {
  const parent = path.join(process.cwd(), '.obsidian-debug', 'zcode-settings-20261102', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'providers-'));
  const target = path.join(root, 'provider_config.json');
  return { root, target, service: new ZCodePersonalConfigService(target, path.join(root, 'archive')) };
}

describe('ZCode personal API configuration transactions', () => {
  it('creates the native schema, masks keys and preserves existing keys when editing', async () => {
    const { service, target } = await fixture();
    expect((await service.read()).providers).toEqual([]);
    expect((await service.save(draft, null)).status).toBe('success');
    const first = await service.read();
    expect(first.providers[0]).toMatchObject({ name: draft.name, hasApiKey: true, models: ['fixture-model'] });
    expect(JSON.stringify(first)).not.toContain('fixture-key');
    const provider = first.providers[0];
    expect((await service.save({ ...draft, id: provider.id, name: 'Renamed', apiKey: undefined }, first.revision)).status).toBe('success');
    const document = JSON.parse(await readFile(target, 'utf8'));
    expect(document.schemaVersion).toBe(1);
    expect(document.config.providerConfigRules.providerRules[0].config.access.apiKey).toBe('fixture-key');
    expect((await service.read()).providers[0].name).toBe('Renamed');
  });

  it('keeps external changes and refuses stale snapshots', async () => {
    const { service, target } = await fixture();
    await service.save(draft, null);
    const snapshot = await service.read();
    const external = JSON.parse(await readFile(target, 'utf8'));
    external.config.providerOrder = ['external-order'];
    await writeFile(target, JSON.stringify(external));
    expect((await service.save({ ...draft, id: snapshot.providers[0].id, name: 'Stale' }, snapshot.revision)).status).toBe('conflict');
    expect(JSON.parse(await readFile(target, 'utf8')).config.providerOrder).toEqual(['external-order']);
    expect((await service.read()).providers[0].name).toBe('Test API');
  });

  it('preserves unrelated provider/model fields while removing only deleted model references', async () => {
    const { service, target } = await fixture();
    await service.save(draft, null);
    const document = JSON.parse(await readFile(target, 'utf8'));
    const id = document.config.providerConfigRules.providerRules[0].providerId;
    document.config.providerConfigRules.providerRules[0].config.api.headers = { 'X-Fixture': 'keep' };
    document.config.modelConfigRules.providerModelRules = [{ providerId: id, modelId: 'fixture-model', config: { enabled: true } }, { providerId: 'other', modelId: 'other', config: { enabled: true } }];
    document.config.defaultModelSelection = { providerId: 'other', modelId: 'other' };
    document.config.providerOrder = [id, 'other'];
    await writeFile(target, JSON.stringify(document));
    const snapshot = await service.read();
    await service.save({ ...draft, id, models: ['new-model'], apiKey: undefined }, snapshot.revision);
    const changed = JSON.parse(await readFile(target, 'utf8'));
    expect(changed.config.providerConfigRules.providerRules[0].config.api.headers).toEqual({ 'X-Fixture': 'keep' });
    expect(changed.config.modelConfigRules.providerModelRules).toEqual([{ providerId: 'other', modelId: 'other', config: { enabled: true } }]);
    expect(changed.config.defaultModelSelection).toEqual({ providerId: 'other', modelId: 'other' });
    expect((await service.remove(id, (await service.read()).revision)).status).toBe('success');
    expect((await service.read()).providers).toEqual([]);
    expect(JSON.parse(await readFile(target, 'utf8')).config.providerOrder).toEqual(['other']);
  });

  it('rejects unsupported schemas, account providers, invalid forms and symlink targets without rewriting them', async () => {
    const { service, target, root } = await fixture();
    await expect(service.save({ ...draft, baseUrl: 'https://name:secret@example.invalid' }, null)).rejects.toThrow('url-invalid');
    await expect(service.save({ ...draft, apiKey: '' }, null)).rejects.toThrow('key-required');
    await writeFile(target, '{"schemaVersion":99,"config":{}}');
    await expect(service.read()).rejects.toThrow('version-unsupported');
    expect(await readFile(target, 'utf8')).toContain('99');
    const other = path.join(root, 'outside.json');
    await writeFile(other, '{"keep":true}');
    const linked = new ZCodePersonalConfigService(path.join(root, 'linked.json'));
    await symlink(other, linked.targetPath);
    await expect(linked.read()).rejects.toThrow();
    expect(await readFile(other, 'utf8')).toBe('{"keep":true}');
  });

  it('lists archive history and restores an overwrite entry through the canonical secure path', async () => {
    const { service, target } = await fixture();
    // No writes yet: history exists but has no entries.
    expect(await service.listPersonalConfigHistory()).toEqual([]);
    await service.save(draft, null);
    const beforeSecond = await service.read();
    await service.save({ ...draft, id: beforeSecond.providers[0]!.id, name: 'Renamed', apiKey: undefined }, beforeSecond.revision);

    const history = await service.listPersonalConfigHistory();
    expect(history !== null && history.length > 0).toBe(true);
    const entry = history![history!.length - 1]!;
    expect(entry.archiveKind).toBe('overwrite');

    // Restoring without expecting the target present must conflict, never blind-write.
    const blindConflict = await service.restorePersonalConfigEntry(entry.identity, null);
    expect(blindConflict.status).toBe('conflict');

    // Stale expected revision must conflict too.
    const stale = await service.restorePersonalConfigEntry(entry.identity, beforeSecond.revision);
    expect(stale.status).toBe('conflict');

    // Correct revision: archive current content, restore archived content.
    const current = await service.read();
    const restored = await service.restorePersonalConfigEntry(entry.identity, current.revision);
    expect(restored.status).toBe('success');
    const document = JSON.parse(await readFile(target, 'utf8'));
    const restoredRule = document.config.providerConfigRules.providerRules[0];
    expect(restoredRule.providerName).toBe('Test API');
    expect(restoredRule.config.access.apiKey).toBe('fixture-key');
    // Restore re-archives the replaced content: history grows.
    const historyAfter = await service.listPersonalConfigHistory();
    expect(historyAfter !== null && historyAfter.length > history!.length).toBe(true);
  });

  it('hides other targets from a differently-rooted service and rejects foreign identities', async () => {
    const { service, target, root } = await fixture();
    await service.save(draft, null);
    const snapshotForEdit = await service.read();
    await service.save({ ...draft, id: snapshotForEdit.providers[0]!.id, name: 'Renamed', apiKey: undefined }, snapshotForEdit.revision);
    // The allowlist root must exist for containment checks; create the foreign root first.
    await mkdir(path.join(root, 'other-dir'), { recursive: true });
    const foreign = new ZCodePersonalConfigService(path.join(root, 'other-dir', 'provider_config.json'), path.join(root, 'other-archive'));
    expect(await foreign.listPersonalConfigHistory()).toEqual([]);

    const history = await service.listPersonalConfigHistory();
    expect(history !== null && history.length > 0).toBe(true);
    const foreignResult = await foreign.restorePersonalConfigEntry(history![0]!.identity, null);
    expect(foreignResult.status === 'invalid-path' || foreignResult.status === 'archive-failed' || foreignResult.status === 'not-found').toBe(true);
    // The original target survives the rejected foreign restore untouched.
    const document = JSON.parse(await readFile(target, 'utf8'));
    expect(document.config.providerConfigRules.providerRules[0].providerName).toBe('Renamed');
  });
});
