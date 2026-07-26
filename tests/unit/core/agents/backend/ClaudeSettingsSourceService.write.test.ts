/**
 * Tracer bullet — ClaudeSettingsSourceService.write: default-Project strict
 * JSON safe create (first behavior of the public raw-write seam).
 *
 * Observes:
 *   service.getDefaultProjectSettingsPath() / getDefaultGlobalSettingsPath()
 *   service.write({ targetPath, content, expectedRevision }) -> outcome
 *
 * The default create target is Project only; Global is a separate explicit
 * target and must not be created. The committed bytes must equal the draft
 * exactly, with verified persistence / pending application / non-verified
 * runtime evidence.
 */
import { createHash } from 'node:crypto';

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

type WriteResult = {
  targetPath: string;
  draft: string;
  evidence: { persistence: string; application: string; runtime: string };
  result:
    | { status: 'success'; revision: { sha256: string } }
    | { status: 'conflict' }
    | { status: 'invalid-content' }
    | { status: 'write-failed' }
    | { status: 'read-only' }
    | { status: 'invalid-target' };
};

describe('ClaudeSettingsSourceService write', () => {
  it('creates the default Project settings file with exact bytes and does not touch Global', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-write-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const archiveRoot = path.join(sandbox, 'archive');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    // <vault>/.claude intentionally absent — default Project create must make it.

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath: archiveRoot,
    });

    const projectPath = service.getDefaultProjectSettingsPath();
    expect(projectPath).toBe(path.join(vault, '.claude', 'settings.json'));
    // Global is a separate explicit target, never the default create target.
    expect(service.getDefaultGlobalSettingsPath()).toBe(path.join(home, '.claude', 'settings.json'));

    // strict-valid JSON carrying an unknown field (must round-trip untouched)
    const content = '{"hooks":{"Stop":[]},"unknownField":7}';
    const outcome = (await service.write({
      targetPath: projectPath,
      content,
      expectedRevision: null,
    })) as WriteResult;

    // draft is the exact submitted text
    expect(outcome.draft).toBe(content);
    expect(outcome.targetPath).toBe(projectPath);
    expect(outcome.result.status).toBe('success');
    if (outcome.result.status !== 'success') throw new Error('unreachable');
    expect(outcome.result.revision.sha256).toBe(sha256(content));

    // disk bytes exactly equal draft (no formatting / repair / normalization)
    const disk = await fs.readFile(projectPath, 'utf8');
    expect(disk).toBe(outcome.draft);

    // evidence: persistence verified, application pending, runtime not verified
    expect(outcome.evidence.persistence).toBe('verified');
    expect(outcome.evidence.application).toBe('pending');
    expect(outcome.evidence.runtime).not.toBe('verified');

    // default create lands only Project; Global must NOT be created.
    await expect(fs.access(path.join(home, '.claude', 'settings.json'))).rejects.toThrow();

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
