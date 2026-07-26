/**
 * Tracer bullet — a correct revision update produces an overwrite archive that
 * is exposed through the public listHistory() as opaque history.
 *
 * Flow: write create v1 -> write update v2 (expectedRevision = v1) -> listHistory
 * must report at least one 'overwrite' archive entry, while the live disk file
 * remains v2. Archive internals are never read or asserted.
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

type HistoryOutcome =
  | { status: 'success'; targets: Array<{ entries: Array<{ archiveKind: string }> }> }
  | { status: 'invalid-target' }
  | { status: 'read-only' }
  | { status: 'archive-failed' }
  | { status: 'invalid-path' };

describe('ClaudeSettingsSourceService history', () => {
  it('archives an overwrite on revision update and lists it via listHistory', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-history-'));
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

    const v1 = '{"hooks":{"Stop":[]}}';
    const created = (await service.write({ targetPath: projectPath, content: v1, expectedRevision: null })) as WriteOutcome;
    expect(created.result.status).toBe('success');
    if (created.result.status !== 'success') throw new Error('unreachable');
    const v1Revision = created.result.revision;

    const v2 = '{"hooks":{"Stop":[]},"permissions":{"allow":["Bash"]}}';
    const updated = (await service.write({ targetPath: projectPath, content: v2, expectedRevision: v1Revision })) as WriteOutcome;
    expect(updated.result.status).toBe('success');

    const history = (await service.listHistory(projectPath)) as HistoryOutcome;
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('unreachable');

    // at least one opaque 'overwrite' archive entry exists (no internal paths read)
    const overwriteCount = history.targets
      .flatMap((target) => target.entries)
      .filter((entry) => entry.archiveKind === 'overwrite').length;
    expect(overwriteCount).toBeGreaterThanOrEqual(1);

    // the live disk file is still v2 (history is side-effect-free on the target)
    expect(await fs.readFile(projectPath, 'utf8')).toBe(v2);

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
