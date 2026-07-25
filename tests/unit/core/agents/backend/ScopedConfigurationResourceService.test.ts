import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { computeFileRevision } from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import { ScopedConfigurationResourceService } from '../../../../../src/core/agents/backend/ScopedConfigurationResourceService';

describe('ScopedConfigurationResourceService', () => {
  let sandboxPath: string;
  let archiveRootPath: string;
  let service: ScopedConfigurationResourceService;

  beforeEach(async () => {
    sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-scoped-resource-'));
    archiveRootPath = path.join(sandboxPath, 'archive');
    service = new ScopedConfigurationResourceService({
      backend: 'test-backend',
      kind: 'command',
      format: 'markdown',
      relativeRootPath: path.join('.tool', 'commands'),
    });
  });

  afterEach(async () => {
    await fs.rm(sandboxPath, { recursive: true, force: true });
  });

  it('owns scoped revision, mutation, archive catalog, and selected restore plumbing', async () => {
    const rootPath = path.join(sandboxPath, '.tool', 'commands');
    const target = {
      scope: 'global' as const,
      basePath: sandboxPath,
      targetRelativePath: 'review.md',
      archiveRootPath,
    };
    await expect(fs.stat(rootPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const created = await service.create({ ...target, content: '# v1\n', expectedRevision: null });
    expect(created.status).toBe('success');
    if (created.status !== 'success') throw new Error('create failed');
    expect(created.targetPath).toBe(path.join(sandboxPath, '.tool', 'commands', 'review.md'));
    await expect(fs.stat(rootPath)).resolves.toMatchObject({ isDirectory: expect.any(Function) });

    await expect(service.readRevision(target)).resolves.toEqual(created.revision);
    const updated = await service.update({ ...target, content: '# v2\n', expectedRevision: created.revision });
    expect(updated.status).toBe('success');
    if (updated.status !== 'success') throw new Error('update failed');
    const deleted = await service.delete({ ...target, expectedRevision: updated.revision });
    expect(deleted.status).toBe('success');

    const history = await service.catalogHistory(target);
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('history failed');
    expect(history.targets).toHaveLength(1);
    const deletedEntry = history.targets[0].entries.find((entry) => entry.archiveKind === 'delete');
    expect(deletedEntry).toBeDefined();
    const restored = await service.restore({
      ...target,
      entryIdentity: deletedEntry!.identity,
      expectedRevision: null,
    });
    expect(restored.status).toBe('success');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe('# v2\n');
  });

  it('restores a catalogued deleted entry after a two-level narrow root is removed', async () => {
    const target = {
      scope: 'project' as const,
      basePath: sandboxPath,
      targetRelativePath: 'review.md',
      archiveRootPath,
    };
    const created = await service.create({ ...target, content: '# v1\n', expectedRevision: null });
    if (created.status !== 'success') throw new Error('create failed');
    const updated = await service.update({ ...target, content: '# v2\n', expectedRevision: created.revision });
    if (updated.status !== 'success') throw new Error('update failed');
    const deleted = await service.delete({ ...target, expectedRevision: updated.revision });
    if (deleted.status !== 'success') throw new Error('delete failed');
    await fs.rm(path.join(sandboxPath, '.tool'), { recursive: true, force: true });

    const catalog = await service.catalogHistory(target);
    if (catalog.status !== 'success') throw new Error(catalog.cause);
    const identity = catalog.targets[0]?.entries.find((entry) => entry.archiveKind === 'delete')?.identity;
    if (!identity) throw new Error('deleted identity missing');

    const staleRestore = await service.restore({
      ...target,
      entryIdentity: identity,
      expectedRevision: updated.revision,
    });
    expect(staleRestore.status).toBe('conflict');
    expect(await fs.stat(path.join(sandboxPath, '.tool')).then(() => true, () => false)).toBe(false);

    const restored = await service.restore({ ...target, entryIdentity: identity, expectedRevision: null });

    expect(restored.status).toBe('success');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe('# v2\n');
  });

  it('rejects a target symlink outside its exact resource root', async () => {
    const rootPath = path.join(sandboxPath, '.tool', 'commands');
    await fs.mkdir(rootPath, { recursive: true });
    const outsidePath = path.join(sandboxPath, 'outside.md');
    await fs.writeFile(outsidePath, '# outside\n', 'utf8');
    await fs.symlink(outsidePath, path.join(rootPath, 'escape.md'));
    const target = {
      scope: 'project' as const,
      basePath: sandboxPath,
      targetRelativePath: 'escape.md',
      archiveRootPath,
    };

    await expect(service.readRevision(target)).resolves.toBeNull();
    const result = await service.update({
      ...target,
      content: '# replaced\n',
      expectedRevision: {
        canonicalPath: outsidePath,
        mtimeMs: 0,
        size: 0,
        sha256: '0'.repeat(64),
      },
    });
    expect(result.status).toBe('invalid-path');
    await expect(fs.readFile(outsidePath, 'utf8')).resolves.toBe('# outside\n');
  });
});

describe('ScopedConfigurationResourceService escaping fixed-root symlinks', () => {
  let sandboxPath: string;
  let outsidePath: string;
  let archiveRootPath: string;
  let service: ScopedConfigurationResourceService;

  beforeEach(async () => {
    sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-scoped-victim-'));
    outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-scoped-outside-'));
    archiveRootPath = path.join(sandboxPath, 'archive');
    service = new ScopedConfigurationResourceService({
      backend: 'test-backend',
      kind: 'command',
      format: 'markdown',
      relativeRootPath: path.join('.tool', 'commands'),
    });
  });

  afterEach(async () => {
    await fs.rm(sandboxPath, { recursive: true, force: true });
    await fs.rm(outsidePath, { recursive: true, force: true });
  });

  it('rejects create before materializing a missing narrow root through an escaping parent symlink', async () => {
    await fs.symlink(outsidePath, path.join(sandboxPath, '.tool'));
    const result = await service.create({
      scope: 'global',
      basePath: sandboxPath,
      targetRelativePath: 'review.md',
      content: '# must not escape\n',
      expectedRevision: null,
      archiveRootPath,
    });

    expect(result.status).toBe('invalid-path');
    await expect(fs.stat(path.join(outsidePath, 'commands'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(outsidePath, 'commands', 'review.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a parent symlink planted after initial root resolution before mkdir can materialize outside directories', async () => {
    const resolvePaths = (service as unknown as {
      resolvePaths: (context: {
        scope: 'global';
        basePath: string;
        targetRelativePath: string;
        archiveRootPath: string;
      }) => Promise<unknown>;
    }).resolvePaths.bind(service);
    const plantedParentPath = path.join(sandboxPath, '.tool');
    jest.spyOn(service as never, 'resolvePaths').mockImplementation(async (context) => {
      const paths = await resolvePaths(context);
      await fs.symlink(outsidePath, plantedParentPath);
      return paths;
    });

    const result = await service.create({
      scope: 'global',
      basePath: sandboxPath,
      targetRelativePath: 'review.md',
      content: '# must stay confined\n',
      expectedRevision: null,
      archiveRootPath,
    });

    expect(result.status).toBe('invalid-path');
    await expect(fs.stat(path.join(outsidePath, 'commands'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(outsidePath, 'commands', 'review.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an escaping parent symlink planted after missing-root restore catalog validation', async () => {
    const target = {
      scope: 'global' as const,
      basePath: sandboxPath,
      targetRelativePath: 'review.md',
      archiveRootPath,
    };
    const created = await service.create({ ...target, content: '# v1\n', expectedRevision: null });
    if (created.status !== 'success') throw new Error('create failed');
    const deleted = await service.delete({ ...target, expectedRevision: created.revision });
    if (deleted.status !== 'success') throw new Error('delete failed');
    await fs.rm(path.join(sandboxPath, '.tool'), { recursive: true, force: true });
    const catalog = await service.catalogHistory(target);
    if (catalog.status !== 'success') throw new Error(catalog.cause);
    const identity = catalog.targets[0]?.entries.find((entry) => entry.archiveKind === 'delete')?.identity;
    if (!identity) throw new Error('deleted identity missing');

    const originalCatalog = service.catalogHistory.bind(service);
    jest.spyOn(service, 'catalogHistory').mockImplementation(async (context) => {
      const result = await originalCatalog(context);
      await fs.symlink(outsidePath, path.join(sandboxPath, '.tool'));
      return result;
    });
    const restored = await service.restore({ ...target, entryIdentity: identity, expectedRevision: null });

    expect(restored.status).toBe('invalid-path');
    await expect(fs.stat(path.join(outsidePath, 'commands'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(outsidePath, 'commands', 'review.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails every read, mutation, history, catalog, and restore seam closed before trusting an escaping root', async () => {
    const externalContext = {
      scope: 'global' as const,
      basePath: outsidePath,
      targetRelativePath: 'review.md',
      archiveRootPath,
    };
    const created = await service.create({ ...externalContext, content: '# external v1\n', expectedRevision: null });
    if (created.status !== 'success') throw new Error('external create failed');
    const updated = await service.update({
      ...externalContext,
      content: '# external v2\n',
      expectedRevision: created.revision,
    });
    if (updated.status !== 'success') throw new Error('external update failed');
    const deleted = await service.delete({ ...externalContext, expectedRevision: updated.revision });
    if (deleted.status !== 'success') throw new Error('external delete failed');
    const externalHistory = await service.catalogHistory(externalContext);
    if (externalHistory.status !== 'success') throw new Error('external history failed');
    const deletedEntry = externalHistory.targets[0]?.entries.find((entry) => entry.archiveKind === 'delete');
    if (!deletedEntry) throw new Error('external deleted entry missing');

    await fs.symlink(path.join(outsidePath, '.tool'), path.join(sandboxPath, '.tool'));
    const victimContext = { ...externalContext, basePath: sandboxPath };
    const listed = await service.listHistory(victimContext);
    const catalog = await service.catalogHistory(victimContext);
    const restored = await service.restore({
      ...victimContext,
      entryIdentity: deletedEntry.identity,
      expectedRevision: null,
    });
    const externalTargetPath = path.join(outsidePath, '.tool', 'commands', 'review.md');
    const absentAfterRestore = await fs.stat(externalTargetPath).then(() => false, () => true);

    const outsideBytes = '# outside winner\n';
    await fs.writeFile(externalTargetPath, outsideBytes, 'utf8');
    const updateRevision = await computeFileRevision(externalTargetPath);
    if (updateRevision === null) throw new Error('outside update revision missing');
    const readRevision = await service.readRevision(victimContext);
    const escapedUpdate = await service.update({
      ...victimContext,
      content: '# attacked update\n',
      expectedRevision: updateRevision,
    });
    const bytesAfterUpdate = await fs.readFile(externalTargetPath, 'utf8');

    await fs.writeFile(externalTargetPath, outsideBytes, 'utf8');
    const deleteRevision = await computeFileRevision(externalTargetPath);
    if (deleteRevision === null) throw new Error('outside delete revision missing');
    const escapedDelete = await service.delete({ ...victimContext, expectedRevision: deleteRevision });
    const existsAfterDelete = await fs.stat(externalTargetPath).then(() => true, () => false);
    const bytesAfterDelete = existsAfterDelete ? await fs.readFile(externalTargetPath, 'utf8') : null;

    expect({
      listed: listed.status,
      catalog: catalog.status,
      restored: restored.status,
      absentAfterRestore,
      readRevision,
      update: escapedUpdate.status,
      bytesAfterUpdate,
      delete: escapedDelete.status,
      existsAfterDelete,
      bytesAfterDelete,
    }).toEqual({
      listed: 'invalid-path',
      catalog: 'archive-failed',
      restored: 'invalid-path',
      absentAfterRestore: true,
      readRevision: null,
      update: 'invalid-path',
      bytesAfterUpdate: outsideBytes,
      delete: 'invalid-path',
      existsAfterDelete: true,
      bytesAfterDelete: outsideBytes,
    });
  });
});
