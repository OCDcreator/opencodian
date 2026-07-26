/**
 * Tracer bullet — catalogHistory(scope) discovers validated history even after
 * the current narrow root is deleted, with zero materialization.
 *
 * Flow: write create project -> delete (exact revision) -> fs.rm(<vault>/.claude)
 * -> catalogHistory('project') must still report the 'delete' archive entry, and
 * the narrow root must remain absent (read-only, no mkdir/materialize).
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

type Revision = { canonicalPath: string; mtimeMs: number; size: number; sha256: string };

type WriteOutcome = { result: { status: 'success'; revision: Revision } | { status: 'conflict' } };

type DeleteOutcome = { result: { status: 'success' } | { status: 'conflict' } };

type CatalogOutcome =
  | { status: 'success'; targets: Array<{ scope: string; entries: Array<{ archiveKind: string; identity: unknown }> }> }
  | { status: 'archive-failed'; cause: string };

describe('ClaudeSettingsSourceService catalogHistory', () => {
  it('catalogs validated history after the narrow root is deleted, with zero materialization', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-catalog-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const archiveRoot = path.join(sandbox, 'archive');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath: archiveRoot,
    });
    const projectPath = path.join(vault, '.claude', 'settings.json');
    const claudeRoot = path.join(vault, '.claude');

    const created = (await service.write({
      targetPath: projectPath,
      content: '{"hooks":{"Stop":[]}}',
      expectedRevision: null,
    })) as WriteOutcome;
    expect(created.result.status).toBe('success');
    if (created.result.status !== 'success') throw new Error('unreachable');
    const revision = created.result.revision;

    const deleted = (await service.delete({ targetPath: projectPath, expectedRevision: revision })) as DeleteOutcome;
    expect(deleted.result.status).toBe('success');

    // simulate the entire narrow root disappearing (e.g. .claude removed)
    await fs.rm(claudeRoot, { recursive: true, force: true });
    await expect(fs.stat(claudeRoot)).rejects.toThrow();

    const catalog = (await service.catalogHistory('project')) as CatalogOutcome;
    expect(catalog.status).toBe('success');
    if (catalog.status !== 'success') throw new Error('unreachable');

    const projectTarget = catalog.targets.find((target) => target.scope === 'project');
    expect(projectTarget).toBeDefined();
    const deleteEntries = projectTarget!.entries.filter((entry) => entry.archiveKind === 'delete');
    expect(deleteEntries.length).toBeGreaterThanOrEqual(1);

    // zero materialization: the narrow root is still absent after the read-only call
    await expect(fs.stat(claudeRoot)).rejects.toThrow();

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
