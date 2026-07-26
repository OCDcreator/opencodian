/**
 * Tracer bullet — managed settings mutation is unconditionally read-only,
 * prioritized BEFORE content parsing, with zero materialization.
 *
 * Both write() and applyPathEdits() on a managed target must short-circuit to
 * `read-only` before any strict-JSON validation / path edit, must preserve the
 * input draft, and must not create/write/archive the (absent) managed root.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

type Outcome = {
  draft: string;
  result: { status: 'read-only' | 'invalid-content' | 'invalid-target' | 'success' | 'conflict' };
};

describe('ClaudeSettingsSourceService managed read-only', () => {
  it('rejects managed mutation as read-only before content parsing, with zero materialization', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-managed-ro-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    const managedConfigDir = path.join(sandbox, 'absent-managed');
    // managedConfigDir intentionally does not exist.

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir,
      archiveRootPath: path.join(sandbox, 'archive'),
    });

    const managedTarget = path.join(managedConfigDir, 'managed-settings.json');
    const invalidContent = 'not-strict-json {{{';

    // write: read-only before content validation (already ordered correctly)
    const writeOutcome = (await service.write({
      targetPath: managedTarget,
      content: invalidContent,
      expectedRevision: null,
    })) as Outcome;
    expect(writeOutcome.result.status).toBe('read-only');
    expect(writeOutcome.draft).toBe(invalidContent);

    // applyPathEdits: must be read-only BEFORE strict validation / applyJsoncPathEdits
    const editsOutcome = (await service.applyPathEdits({
      targetPath: managedTarget,
      baseContent: invalidContent,
      edits: [{ path: ['permissions', 'allow'], value: ['Bash'] }],
      expectedRevision: null,
    })) as Outcome;
    expect(editsOutcome.result.status).toBe('read-only');
    expect(editsOutcome.draft).toBe(invalidContent);

    // zero materialization: the managed root must remain absent.
    await expect(fs.stat(managedConfigDir)).rejects.toThrow();

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
