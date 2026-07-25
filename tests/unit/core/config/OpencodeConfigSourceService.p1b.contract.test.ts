/* eslint-disable max-lines, max-lines-per-function -- Cohesive P1-B public contract matrix shares one isolated project/global/managed/archive fixture. */
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import * as projectResourceSecureWrite from '../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import {
  type ArchiveHistoryEntryIdentity,
  type FileRevision,
  listConfigurationArchiveHistory,
  readAllowlistedFileSnapshot,
  safeDeleteFile,
  safeWriteFile,
} from '../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import { OpencodeConfigManager } from '../../../../src/core/config/OpencodeConfigManager';
import {
  OpencodeConfigSourceService,
} from '../../../../src/core/config/OpencodeConfigSourceService';

let mockBeforeMkdir: ((targetPath: string) => Promise<void>) | undefined;

jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual('node:fs/promises') as typeof import('node:fs/promises');
  return {
    ...actual,
    mkdir: jest.fn(async (targetPath: string, ...args: unknown[]) => {
      await mockBeforeMkdir?.(targetPath);
      return actual.mkdir(targetPath, ...(args as Parameters<typeof actual.mkdir>));
    }),
  };
});

jest.mock('obsidian', () => ({ Notice: jest.fn() }));

interface Fixture {
  root: string;
  vault: string;
  home: string;
  xdg: string;
  managed: string;
  archive: string;
}

function createFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-p1b-config-'));
  const fixture = {
    root,
    vault: path.join(root, 'vault'),
    home: path.join(root, 'home'),
    xdg: path.join(root, 'xdg'),
    managed: path.join(root, 'managed'),
    archive: path.join(root, 'archive'),
  };
  fs.mkdirSync(fixture.vault, { recursive: true });
  fs.mkdirSync(fixture.home, { recursive: true });
  fs.mkdirSync(fixture.managed, { recursive: true });
  return fixture;
}

function serviceFor(fixture: Fixture, xdgConfigHome: string | null = fixture.xdg): OpencodeConfigSourceService {
  return new OpencodeConfigSourceService(fixture.vault, {
    homePath: fixture.home,
    xdgConfigHome,
    managedConfigDir: fixture.managed,
    archiveRootPath: fixture.archive,
  });
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

async function createDeletedArchiveIdentity(
  fixture: Fixture,
  targetPath: string,
  backend: string,
): Promise<ArchiveHistoryEntryIdentity> {
  const allowlist = [{ scope: 'global' as const, rootPath: path.dirname(targetPath) }];
  const archive = {
    archiveRootPath: fixture.archive,
    backend,
    kind: 'configuration',
    format: 'jsonc' as const,
  };
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const created = await safeWriteFile({
    targetPath,
    content: '{\n  "archived": true\n}\n',
    expectedRevision: null,
    allowlist,
    archive,
    format: 'jsonc',
  });
  if (created.status !== 'success') throw new Error(`archive fixture create failed: ${created.status}`);
  const deleted = await safeDeleteFile({
    targetPath,
    expectedRevision: created.revision,
    allowlist,
    archive,
  });
  if (deleted.status !== 'success') throw new Error(`archive fixture delete failed: ${deleted.status}`);
  const history = await listConfigurationArchiveHistory({ targetPath, allowlist, archive });
  if (history.status !== 'success') throw new Error(`archive fixture history failed: ${history.status}`);
  const identity = history.targets[0]?.entries.find((entry) => entry.archiveKind === 'delete')?.identity;
  if (!identity) throw new Error('archive fixture delete identity missing');
  return identity;
}

describe('P1-B OpenCode configuration source contract', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    mockBeforeMkdir = undefined;
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it('inventories project, XDG global, and read-only managed candidates with source truth', async () => {
    const service = serviceFor(fixture);
    const projectLegacy = path.join(fixture.vault, '.opencode', 'opencode.json');
    const globalDefault = path.join(fixture.xdg, 'opencode', 'opencode.jsonc');
    const managedJson = path.join(fixture.managed, 'opencode.json');
    writeText(projectLegacy, '{\n  "permission": "ask"\n}\n');
    writeText(globalDefault, '{ invalid');
    writeText(managedJson, '{\n  "permission": "deny"\n}\n');

    const candidates = await service.inventory();
    const byPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
    const projectDefault = path.join(fixture.vault, '.opencode', 'opencode.jsonc');

    expect(byPath.get(projectDefault)).toMatchObject({
      scope: 'project',
      source: 'project-default',
      exists: false,
      editable: true,
      revision: null,
    });
    expect(byPath.get(projectLegacy)).toMatchObject({
      scope: 'project',
      source: 'project-legacy',
      exists: true,
      editable: true,
    });
    expect(byPath.get(projectLegacy)?.parseError).toBeUndefined();
    expect(byPath.get(projectLegacy)?.revision?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(byPath.get(globalDefault)).toMatchObject({
      scope: 'global',
      source: 'global-xdg-default',
      exists: true,
      editable: true,
    });
    expect(byPath.get(globalDefault)?.parseError).toContain('JSONC parse error');
    expect(byPath.get(managedJson)).toMatchObject({
      scope: 'managed',
      source: 'managed-system',
      exists: true,
      editable: false,
    });
  });

  it('does not expose editable source bytes or revision through a symlink outside its narrow root', async () => {
    const service = serviceFor(fixture);
    const targetPath = service.getDefaultProjectConfigPath();
    const outsidePath = path.join(fixture.vault, 'outside-opencode.jsonc');
    const outsideContent = '{\n  "outsideSecret": "must-not-be-read"\n}\n';
    writeText(outsidePath, outsideContent);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.symlinkSync(outsidePath, targetPath);

    const candidate = (await service.inventory()).find((entry) => entry.path === targetPath);
    expect(candidate?.revision).toBeNull();
    expect(candidate?.parseError).toMatch(/allowlist|confinement|path/i);
    expect(candidate?.evidence.persistence).toBe('failed');

    const read = await service.read(targetPath);
    expect(read).toMatchObject({
      status: 'success',
      content: '',
      source: {
        revision: null,
        parseError: expect.stringMatching(/allowlist|confinement|path/i),
        evidence: { persistence: 'failed' },
      },
    });
    expect(fs.readFileSync(outsidePath, 'utf8')).toBe(outsideContent);
  });

  it('does not expose managed source bytes or revision through a symlink outside its exact root', async () => {
    const service = serviceFor(fixture);
    const targetPath = path.join(fixture.managed, 'opencode.jsonc');
    const outsidePath = path.join(fixture.root, 'outside-managed-opencode.jsonc');
    const outsideContent = '{\n  "managedSecret": "must-not-be-read"\n}\n';
    writeText(outsidePath, outsideContent);
    fs.symlinkSync(outsidePath, targetPath);

    const candidate = (await service.inventory()).find((entry) => entry.path === targetPath);
    expect(candidate).toMatchObject({
      editable: false,
      revision: null,
      parseError: expect.stringMatching(/confinement|path/i),
      evidence: { persistence: 'failed' },
    });

    const read = await service.read(targetPath);
    expect(read).toMatchObject({
      status: 'success',
      content: '',
      source: {
        editable: false,
        revision: null,
        parseError: expect.stringMatching(/confinement|path/i),
      },
    });
    expect((await service.write({ targetPath, content: '{}\n', expectedRevision: null })).result.status).toBe('read-only');
    expect(fs.readFileSync(outsidePath, 'utf8')).toBe(outsideContent);
  });

  it('falls back to ~/.config only when XDG_CONFIG_HOME is absent', async () => {
    const fallbackService = serviceFor(fixture, null);
    const fallbackPath = path.join(fixture.home, '.config', 'opencode', 'opencode.jsonc');

    expect(fallbackService.getDefaultGlobalConfigPath()).toBe(fallbackPath);
    expect((await fallbackService.inventory()).some((candidate) => (
      candidate.path === fallbackPath
      && candidate.source === 'global-home-default'
      && candidate.scope === 'global'
    ))).toBe(true);
  });

  it('inventories ~/.opencode global legacy candidates without changing the XDG-aware create default', async () => {
    const xdgService = serviceFor(fixture);
    const fallbackService = serviceFor(fixture, null);
    const legacyRoot = path.join(fixture.home, '.opencode');
    const expectedLegacyCandidates = [
      ['opencode.jsonc', 'global-dot-opencode-jsonc-legacy'],
      ['opencode.json', 'global-dot-opencode-json-legacy'],
    ] as const;

    expect(xdgService.getDefaultGlobalConfigPath()).toBe(
      path.join(fixture.xdg, 'opencode', 'opencode.jsonc'),
    );
    expect(fallbackService.getDefaultGlobalConfigPath()).toBe(
      path.join(fixture.home, '.config', 'opencode', 'opencode.jsonc'),
    );

    for (const service of [xdgService, fallbackService]) {
      const byPath = new Map((await service.inventory()).map((candidate) => [candidate.path, candidate]));
      for (const [filename, source] of expectedLegacyCandidates) {
        expect(byPath.get(path.join(legacyRoot, filename))).toMatchObject({
          scope: 'global',
          source,
          exists: false,
          editable: true,
          revision: null,
        });
      }
    }
  });

  it('confines ~/.opencode reads and mutations to the exact legacy root', async () => {
    const service = serviceFor(fixture);
    const targetPath = path.join(fixture.home, '.opencode', 'opencode.jsonc');
    const outsidePath = path.join(fixture.home, 'outside-dot-opencode.jsonc');
    const outsideContent = '{\n  "outsideSecret": "must-not-be-read"\n}\n';
    writeText(outsidePath, outsideContent);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.symlinkSync(outsidePath, targetPath);

    const candidate = (await service.inventory()).find((entry) => entry.path === targetPath);
    expect(candidate).toMatchObject({
      scope: 'global',
      source: 'global-dot-opencode-jsonc-legacy',
      editable: true,
      revision: null,
      parseError: expect.stringMatching(/allowlist|confinement|path/i),
      evidence: { persistence: 'failed' },
    });

    const read = await service.read(targetPath);
    expect(read).toMatchObject({
      status: 'success',
      content: '',
      source: { revision: null, evidence: { persistence: 'failed' } },
    });
    const draft = '{\n  "permission": "allow"\n}\n';
    expect((await service.write({ targetPath, content: draft, expectedRevision: null })).result.status)
      .toBe('invalid-path');
    expect((await service.delete({ targetPath, expectedRevision: null })).result.status)
      .toBe('invalid-path');
    expect(fs.readFileSync(outsidePath, 'utf8')).toBe(outsideContent);
  });

  it('supports safe ~/.opencode write, delete, history, and caller-selected restore', async () => {
    const service = serviceFor(fixture);
    const targetPath = path.join(fixture.home, '.opencode', 'opencode.jsonc');
    const first = '{\n  // dot-opencode\n  "permission": "ask"\n}\n';
    const second = '{\n  // dot-opencode\n  "permission": "allow"\n}\n';

    let outcome = await service.write({ targetPath, content: first, expectedRevision: null });
    expect(outcome.result.status).toBe('success');
    if (outcome.result.status !== 'success') return;
    outcome = await service.write({
      targetPath,
      content: second,
      expectedRevision: outcome.result.revision,
    });
    expect(outcome.result.status).toBe('success');
    if (outcome.result.status !== 'success') return;
    const deleted = await service.delete({ targetPath, expectedRevision: outcome.result.revision });
    expect(deleted.result.status).toBe('success');
    expect(fs.existsSync(targetPath)).toBe(false);

    const catalog = await service.catalogHistory('global');
    expect(catalog.status).toBe('success');
    if (catalog.status !== 'success') return;
    expect(catalog.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        canonicalTarget: path.join(fs.realpathSync(path.dirname(targetPath)), path.basename(targetPath)),
        scope: 'global',
      }),
    ]));

    const history = await service.listHistory(targetPath);
    expect(history.status).toBe('success');
    if (history.status !== 'success') return;
    expect(history.targets[0]).toMatchObject({
      canonicalTarget: path.join(fs.realpathSync(path.dirname(targetPath)), path.basename(targetPath)),
      backend: 'opencode',
      scope: 'global',
      kind: 'configuration',
      format: 'jsonc',
    });
    const deletedEntry = history.targets[0]?.entries.find((entry) => entry.archiveKind === 'delete');
    expect(deletedEntry).toBeDefined();
    if (!deletedEntry) return;

    const restored = await service.restore({
      entryIdentity: deletedEntry.identity,
      expectedRevision: null,
    });
    expect(restored.result.status).toBe('success');
    expect(fs.readFileSync(targetPath, 'utf8')).toBe(second);
  });

  it('keeps coexisting XDG and ~/.opencode global sources independently targetable', async () => {
    const service = serviceFor(fixture);
    const xdgPath = service.getDefaultGlobalConfigPath();
    const legacyPath = path.join(fixture.home, '.opencode', 'opencode.json');
    const xdgContent = '{\n  "permission": "ask",\n  "source": "xdg"\n}\n';
    const legacyContent = '{\n  "permission": "deny",\n  "source": "dot-opencode"\n}\n';
    writeText(xdgPath, xdgContent);
    writeText(legacyPath, legacyContent);

    const legacy = await service.read(legacyPath);
    expect(legacy).toMatchObject({
      status: 'success',
      source: {
        scope: 'global',
        source: 'global-dot-opencode-json-legacy',
        exists: true,
      },
    });
    if (legacy.status !== 'success') return;

    const draft = '{\n  "permission": "allow",\n  "source": "dot-opencode"\n}\n';
    const outcome = await service.write({
      targetPath: legacyPath,
      content: draft,
      expectedRevision: legacy.source.revision,
    });
    expect(outcome.result.status).toBe('success');
    expect(fs.readFileSync(legacyPath, 'utf8')).toBe(draft);
    expect(fs.readFileSync(xdgPath, 'utf8')).toBe(xdgContent);
  });

  it('fails closed when the OpenCode archive catalog contains a same-root non-candidate target', async () => {
    const service = serviceFor(fixture);
    const targetPath = path.join(fixture.home, '.opencode', 'not-an-opencode-config.jsonc');
    await createDeletedArchiveIdentity(fixture, targetPath, 'opencode');

    const catalog = await service.catalogHistory('global');

    expect(catalog.status).toBe('archive-failed');
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it('rejects selected restore identities with a wrong association or non-candidate target', async () => {
    const service = serviceFor(fixture);
    const candidatePath = service.getDefaultGlobalConfigPath();
    const nonCandidatePath = path.join(fixture.home, '.opencode', 'not-an-opencode-config.jsonc');
    const wrongBackendIdentity = await createDeletedArchiveIdentity(fixture, candidatePath, 'claude');
    const nonCandidateIdentity = await createDeletedArchiveIdentity(fixture, nonCandidatePath, 'opencode');

    const wrongBackend = await service.restore({
      entryIdentity: wrongBackendIdentity,
      expectedRevision: null,
    });
    const nonCandidate = await service.restore({
      entryIdentity: nonCandidateIdentity,
      expectedRevision: null,
    });

    expect(wrongBackend.result.status).toBe('invalid-target');
    expect(nonCandidate.result.status).toBe('invalid-target');
    expect(fs.existsSync(candidatePath)).toBe(false);
    expect(fs.existsSync(nonCandidatePath)).toBe(false);
  });

  it('keeps listHistory read-only when the project configuration root does not exist', async () => {
    const service = serviceFor(fixture);
    const projectRoot = path.join(fixture.vault, '.opencode');
    expect(fs.existsSync(projectRoot)).toBe(false);

    const history = await service.listHistory(service.getDefaultProjectConfigPath());

    expect(history).toEqual({ status: 'success', targets: [] });
    expect(fs.existsSync(projectRoot)).toBe(false);
  });

  it('catalogs an existing deleted target without recreating absent global configuration roots', async () => {
    const service = serviceFor(fixture);
    const targetPath = service.getDefaultGlobalConfigPath();
    const globalRoot = path.dirname(targetPath);
    const dotOpencodeRoot = path.join(fixture.home, '.opencode');
    await createDeletedArchiveIdentity(fixture, targetPath, 'opencode');
    const canonicalTarget = path.join(fs.realpathSync(globalRoot), path.basename(targetPath));
    fs.rmSync(globalRoot, { recursive: true, force: true });
    expect(fs.existsSync(globalRoot)).toBe(false);
    expect(fs.existsSync(dotOpencodeRoot)).toBe(false);

    const catalog = await service.catalogHistory('global');

    expect(catalog.status).toBe('success');
    if (catalog.status !== 'success') return;
    expect(catalog.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalTarget, scope: 'global' }),
    ]));
    expect(fs.existsSync(globalRoot)).toBe(false);
    expect(fs.existsSync(dotOpencodeRoot)).toBe(false);
  });

  it('safely creates the explicit XDG global default under a narrow global allowlist', async () => {
    const service = serviceFor(fixture);
    const targetPath = service.getDefaultGlobalConfigPath();
    const content = '{\n  // global source\n  "permission": "ask"\n}\n';

    const outcome = await service.write({ targetPath, content, expectedRevision: null });
    expect(outcome.result.status).toBe('success');
    const snapshot = await service.read(targetPath);
    expect(snapshot.status).toBe('success');
    if (snapshot.status !== 'success') return;
    expect(snapshot.source).toMatchObject({
      scope: 'global',
      source: 'global-xdg-default',
      exists: true,
      editable: true,
    });
    expect(snapshot.source.parseError).toBeUndefined();
    expect(snapshot.source.revision?.canonicalPath).toBe(fs.realpathSync(targetPath));
    expect(snapshot.content).toBe(content);
  });

  it('requires an explicit target when multiple editable candidates exist and never mutates its sibling', async () => {
    const service = serviceFor(fixture);
    const projectPath = service.getDefaultProjectConfigPath();
    const globalPath = service.getDefaultGlobalConfigPath();
    const projectText = '{\n  // project\n  "permission": "ask"\n}\n';
    const globalText = '{\n  // global\n  "permission": "deny"\n}\n';
    writeText(projectPath, projectText);
    writeText(globalPath, globalText);
    const project = await service.read(projectPath);
    expect(project.status).toBe('success');
    if (project.status !== 'success') return;

    const draft = '{\n  // project draft\n  "permission": "allow"\n}\n';
    const outcome = await service.write({
      targetPath: projectPath,
      content: draft,
      expectedRevision: project.source.revision,
    });

    expect(outcome.result.status).toBe('success');
    expect(outcome.draft).toBe(draft);
    expect(fs.readFileSync(projectPath, 'utf8')).toBe(draft);
    expect(fs.readFileSync(globalPath, 'utf8')).toBe(globalText);
  });

  it('rejects managed writes and preserves the submitted draft in the typed outcome', async () => {
    const service = serviceFor(fixture);
    const managedPath = path.join(fixture.managed, 'opencode.jsonc');
    writeText(managedPath, '{}\n');
    const managed = await service.read(managedPath);
    expect(managed.status).toBe('success');
    if (managed.status !== 'success') return;

    const draft = '{ "permission": "allow" }\n';
    const outcome = await service.write({
      targetPath: managedPath,
      content: draft,
      expectedRevision: managed.source.revision,
    });

    expect(outcome).toMatchObject({
      draft,
      result: { status: 'read-only' },
      evidence: {
        persistence: 'failed',
        application: 'not-applicable',
        runtime: 'not-applicable',
      },
    });
    expect(fs.readFileSync(managedPath, 'utf8')).toBe('{}\n');
  });

  it('preserves JSONC comments, unknown fields, key order, indentation, and CRLF during path edits', async () => {
    const service = serviceFor(fixture);
    const targetPath = service.getDefaultProjectConfigPath();
    const original = [
      '{',
      '    // keep provider note',
      '    "provider": {',
      '        "custom": true,',
      '    },',
      '    // permission note',
      '    "permission": {',
      '        "bash": "ask",',
      '    },',
      '    "unknown": "keep",',
      '}',
      '',
    ].join('\r\n');
    writeText(targetPath, original);
    const snapshot = await service.read(targetPath);
    expect(snapshot.status).toBe('success');
    if (snapshot.status !== 'success') return;

    const outcome = await service.applyPathEdits({
      targetPath,
      expectedRevision: snapshot.source.revision,
      edits: [{ path: ['permission', 'bash'], value: 'deny' }],
    });
    expect(outcome.result.status).toBe('success');

    const updated = fs.readFileSync(targetPath, 'utf8');
    expect(updated).toContain('// keep provider note');
    expect(updated).toContain('// permission note');
    expect(updated).toContain('    "unknown": "keep",');
    expect(updated).toContain('        "bash": "deny",');
    expect(updated).toContain('\r\n');
    expect(updated.indexOf('"provider"')).toBeLessThan(updated.indexOf('"permission"'));
    expect(updated.indexOf('"permission"')).toBeLessThan(updated.indexOf('"unknown"'));
  });

  it('returns a conflict without overwriting an external edit and echoes the caller draft', async () => {
    const service = serviceFor(fixture);
    const targetPath = service.getDefaultProjectConfigPath();
    writeText(targetPath, '{\n  "permission": "ask"\n}\n');
    const snapshot = await service.read(targetPath);
    expect(snapshot.status).toBe('success');
    if (snapshot.status !== 'success') return;

    const external = '{\n  "permission": "deny",\n  "external": true\n}\n';
    writeText(targetPath, external);
    const draft = '{\n  "permission": "allow"\n}\n';
    const outcome = await service.write({
      targetPath,
      content: draft,
      expectedRevision: snapshot.source.revision,
    });

    expect(outcome.result.status).toBe('conflict');
    expect(outcome.draft).toBe(draft);
    expect(outcome.evidence).toMatchObject({
      persistence: 'failed',
      application: 'not-applicable',
      runtime: 'not-applicable',
    });
    expect(fs.readFileSync(targetPath, 'utf8')).toBe(external);
  });

  it('rejects an escaping project parent symlink planted after the initial create guard', async () => {
    const service = serviceFor(fixture);
    const targetPath = service.getDefaultProjectConfigPath();
    const projectRoot = path.dirname(targetPath);
    const outsideRoot = path.join(fixture.root, 'outside-opencode-root');
    fs.mkdirSync(outsideRoot, { recursive: true });
    let planted = false;
    mockBeforeMkdir = async (target) => {
      if (!planted && target === projectRoot) {
        planted = true;
        await fsp.symlink(outsideRoot, projectRoot);
      }
    };

    const outcome = await service.write({
      targetPath,
      content: '{\n  "permission": "ask"\n}\n',
      expectedRevision: null,
    });

    expect(planted).toBe(true);
    expect(outcome.result).toMatchObject({ status: 'invalid-path' });
    expect(fs.existsSync(path.join(outsideRoot, 'opencode.jsonc'))).toBe(false);
  });

  it('does not expose stale source bytes when the shared descriptor snapshot detects a read race', async () => {
    const service = serviceFor(fixture);
    const targetPath = service.getDefaultProjectConfigPath();
    const external = '{\n  "external": true\n}\n';
    writeText(targetPath, external);
    const actualSnapshot = readAllowlistedFileSnapshot;
    const current: FileRevision = {
      canonicalPath: fs.realpathSync(targetPath),
      mtimeMs: fs.statSync(targetPath).mtimeMs,
      size: Buffer.byteLength(external),
      sha256: 'b'.repeat(64),
    };
    const snapshotSpy = jest.spyOn(projectResourceSecureWrite, 'readAllowlistedFileSnapshot')
      .mockImplementation(async (options) => (
        options.targetPath === targetPath
          ? { status: 'conflict', expected: null, current }
          : actualSnapshot(options)
      ));

    const source = await service.read(targetPath);

    expect(snapshotSpy).toHaveBeenCalledWith(expect.objectContaining({ targetPath }));
    expect(source).toMatchObject({
      status: 'success',
      content: '',
      source: { exists: false, revision: null, evidence: { persistence: 'failed' } },
    });
    expect(source.status === 'success' ? source.source.parseError : '').toMatch(/snapshot|race|conflict/i);
    snapshotSpy.mockRestore();
  });

  it('archives overwrite/delete history and restores the caller-selected deleted entry', async () => {
    const service = serviceFor(fixture);
    const targetPath = service.getDefaultProjectConfigPath();
    const first = '{\n  "permission": "ask"\n}\n';
    const second = '{\n  "permission": "allow"\n}\n';
    let outcome = await service.write({ targetPath, content: first, expectedRevision: null });
    expect(outcome.result.status).toBe('success');
    if (outcome.result.status !== 'success') return;
    outcome = await service.write({
      targetPath,
      content: second,
      expectedRevision: outcome.result.revision,
    });
    expect(outcome.result.status).toBe('success');
    if (outcome.result.status !== 'success') return;
    const deleted = await service.delete({
      targetPath,
      expectedRevision: outcome.result.revision,
    });
    expect(deleted.result.status).toBe('success');
    expect(fs.existsSync(targetPath)).toBe(false);

    const history = await service.listHistory(targetPath);
    expect(history.status).toBe('success');
    if (history.status !== 'success') return;
    const target = history.targets[0];
    expect(target).toMatchObject({
      canonicalTarget: path.join(fs.realpathSync(path.dirname(targetPath)), path.basename(targetPath)),
      backend: 'opencode',
      scope: 'project',
      kind: 'configuration',
      format: 'jsonc',
    });
    const deletedEntry = target?.entries.find((entry) => entry.archiveKind === 'delete');
    expect(deletedEntry).toBeDefined();
    if (!deletedEntry) return;

    const restored = await service.restore({
      entryIdentity: deletedEntry.identity,
      expectedRevision: null,
    });
    expect(restored.result.status).toBe('success');
    expect(restored.evidence).toMatchObject({
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    });
    expect(fs.readFileSync(targetPath, 'utf8')).toBe(second);
  });

  it('routes legacy structured manager writes through JSONC path patches and the archive contract', async () => {
    const manager = new OpencodeConfigManager(fixture.vault, {
      homePath: fixture.home,
      xdgConfigHome: fixture.xdg,
      managedConfigDir: fixture.managed,
      archiveRootPath: fixture.archive,
    });
    const targetPath = manager.getConfigPath();
    const original = [
      '{',
      '  // provider stays documented',
      '  "provider": { "custom": { "name": "Custom" } },',
      '  "permission": { "bash": "ask" },',
      '  "unknown": true',
      '}',
      '',
    ].join('\n');
    writeText(targetPath, original);

    await manager.updatePermission({ bash: 'deny' });
    const updated = fs.readFileSync(targetPath, 'utf8');
    expect(updated).toContain('// provider stays documented');
    expect(updated).toContain('"unknown": true');
    expect(updated.indexOf('"provider"')).toBeLessThan(updated.indexOf('"permission"'));
    expect(updated).toContain('"bash": "deny"');

    const history = await manager.listConfigurationHistory(targetPath);
    expect(history.status).toBe('success');
    if (history.status !== 'success') return;
    expect(history.targets[0]?.entries.some((entry) => entry.archiveKind === 'overwrite')).toBe(true);
  });

  it('fails closed when a legacy structured write encounters malformed JSONC', async () => {
    const manager = new OpencodeConfigManager(fixture.vault, {
      homePath: fixture.home,
      xdgConfigHome: fixture.xdg,
      managedConfigDir: fixture.managed,
      archiveRootPath: fixture.archive,
    });
    const targetPath = manager.getConfigPath();
    writeText(targetPath, '{ malformed');

    await expect(manager.updatePermission('allow')).rejects.toMatchObject({
      name: 'OpencodeConfigMutationError',
      outcome: { result: { status: 'invalid-content' } },
    });
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('{ malformed');
  });
});
