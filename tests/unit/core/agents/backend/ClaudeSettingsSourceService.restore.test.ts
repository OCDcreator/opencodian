/**
 * Tracer bullet — restore strict JSON from an opaque delete-history identity
 * with an explicit expectedRevision.
 *
 * Flow: write create -> delete (exact revision) -> listHistory (delete
 * identity) -> restore({entryIdentity, expectedRevision:null}) -> disk equals
 * the pre-delete bytes, read() is strict-valid with a revision.
 *
 * restore() accepts only the opaque identity + expectedRevision (never an
 * archive path/targetPath) and remaps the identity's canonical target back to
 * an exact editable inventoried slot via confinement.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';
import type { ArchiveHistoryEntryIdentity } from '../../../../../src/core/agents/backend/ConfigurationArchiveService';

type Revision = { canonicalPath: string; mtimeMs: number; size: number; sha256: string };

type WriteOutcome = {
  result:
    | { status: 'success'; revision: Revision }
    | { status: 'conflict' };
};

type DeleteOutcome = { result: { status: 'success' } | { status: 'conflict' } };

type HistoryOutcome =
  | { status: 'success'; targets: Array<{ entries: Array<{ archiveKind: string; identity: ArchiveHistoryEntryIdentity }> }> }
  | { status: 'invalid-target' }
  | { status: 'read-only' };

type RestoreOutcome = {
  evidence: { persistence: string; application: string; runtime: string };
  result: { status: 'success' } | { status: 'conflict' } | { status: 'invalid-target' } | { status: 'read-only' };
};

type ReadOutcome = {
  status: 'success' | 'invalid-target';
  source?: { revision: Revision | null; parseError?: string };
};

describe('ClaudeSettingsSourceService restore', () => {
  it('restores strict JSON from an opaque delete identity with explicit expectedRevision', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-restore-'));
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

    const original = '{"hooks":{"Stop":[]}}';
    const created = (await service.write({ targetPath: projectPath, content: original, expectedRevision: null })) as WriteOutcome;
    expect(created.result.status).toBe('success');
    if (created.result.status !== 'success') throw new Error('unreachable');
    const revision = created.result.revision;

    const deleted = (await service.delete({ targetPath: projectPath, expectedRevision: revision })) as DeleteOutcome;
    expect(deleted.result.status).toBe('success');

    const history = (await service.listHistory(projectPath)) as HistoryOutcome;
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('unreachable');
    const deleteEntry = history.targets
      .flatMap((target) => target.entries)
      .find((entry) => entry.archiveKind === 'delete');
    expect(deleteEntry).toBeDefined();
    const entryIdentity: ArchiveHistoryEntryIdentity = deleteEntry!.identity;

    // restore carries an explicit expectedRevision (null = target must be absent)
    const restored = (await service.restore({ entryIdentity, expectedRevision: null })) as RestoreOutcome;
    expect(restored.result.status).toBe('success');
    expect(restored.evidence.persistence).toBe('verified');
    expect(restored.evidence.application).toBe('pending');
    expect(restored.evidence.runtime).not.toBe('verified');

    // disk bytes exactly equal the pre-delete content
    expect(await fs.readFile(projectPath, 'utf8')).toBe(original);

    // read() reports a strict-valid restored source with a revision
    const readBack = (await service.read(projectPath)) as ReadOutcome;
    expect(readBack.status).toBe('success');
    expect(readBack.source!.revision).not.toBeNull();
    expect(readBack.source!.parseError).toBeUndefined();

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
