/**
 * Tracer bullet — revision-fenced safe delete + public delete history identity.
 *
 * Flow: write create project -> delete(expectedRevision = created revision) ->
 * target gone + listHistory reports an opaque 'delete' archive entry.
 * delete() must carry a FileRevision (never null) and delegate to the shared
 * safeDeleteFile chokepoint.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

type Revision = { canonicalPath: string; mtimeMs: number; size: number; sha256: string };

type WriteOutcome = {
  result:
    | { status: 'success'; revision: Revision }
    | { status: 'conflict' }
    | { status: 'invalid-content' };
};

type DeleteOutcome = {
  targetPath: string;
  evidence: { persistence: string; application: string; runtime: string };
  result:
    | { status: 'success' }
    | { status: 'conflict' }
    | { status: 'read-only' }
    | { status: 'invalid-target' };
};

type HistoryOutcome =
  | { status: 'success'; targets: Array<{ entries: Array<{ archiveKind: string; identity: unknown }> }> }
  | { status: 'invalid-target' }
  | { status: 'read-only' };

describe('ClaudeSettingsSourceService delete', () => {
  it('revision-fences a safe delete and lists the delete archive entry', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-delete-'));
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
    // honest three-axis evidence; runtime never impersonates verified.
    expect(deleted.evidence.persistence).toBe('verified');
    expect(deleted.evidence.application).toBe('pending');
    expect(deleted.evidence.runtime).not.toBe('verified');

    // target no longer exists
    await expect(fs.access(projectPath)).rejects.toThrow();

    // history exposes an opaque 'delete' archive entry (no internal path read)
    const history = (await service.listHistory(projectPath)) as HistoryOutcome;
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('unreachable');
    const deleteEntries = history.targets
      .flatMap((target) => target.entries)
      .filter((entry) => entry.archiveKind === 'delete');
    expect(deleteEntries.length).toBeGreaterThanOrEqual(1);
    expect(typeof deleteEntries[0].identity).toBe('string');

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
