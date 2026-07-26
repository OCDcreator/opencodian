/**
 * Tracer bullet — ClaudeSettingsSourceService.read: strict-JSON safe read that
 * preserves the exact raw source. Observes the public seam:
 *   service.read(targetPath) -> success{source, content} | invalid-target
 *
 * An invalid-strict-JSON source (valid JSONC: unknown field + comment) must
 * still round-trip byte-for-byte so an advanced editor can repair it, while
 * surfacing strict-JSON diagnostics with failed persistence. Unknown paths are
 * rejected as invalid-target.
 */
import { createHash } from 'node:crypto';

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

type ReadCandidate = {
  scope: string;
  origin: string;
  path: string;
  exists: boolean;
  editable: boolean;
  priority: number;
  revision: { canonicalPath: string; mtimeMs: number; size: number; sha256: string } | null;
  evidence: { persistence: string; application: string; runtime: string };
  parseError?: string;
};

type ReadResult =
  | { status: 'success'; source: ReadCandidate; content: string }
  | { status: 'invalid-target'; targetPath: string };

describe('ClaudeSettingsSourceService read', () => {
  it('returns exact raw bytes with failed persistence for strict-JSON-invalid source, and rejects unknown paths', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-read-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });

    // Valid JSONC (unknown field + comment) but invalid strict JSON: the raw
    // source must round-trip byte-for-byte so an advanced editor can repair it.
    const rawProject = '{"hooks":{"Stop":[]},"unknownField":7\n  // strict JSON rejects comments\n}';
    const projectPath = path.join(vault, '.claude', 'settings.json');
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, rawProject, 'utf8');

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
    });
    const result = (await service.read(projectPath)) as ReadResult;

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('unreachable');

    // exact raw bytes, no formatting/repair/normalization
    expect(result.content).toBe(rawProject);

    const source = result.source as ReadCandidate;
    expect(source.exists).toBe(true);
    expect(source.scope).toBe('project');
    expect(source.editable).toBe(true);
    expect(source.origin).toBe('project-settings');

    // revision sha256 over the exact raw text, from the same descriptor-bound read
    expect(source.revision).not.toBeNull();
    expect(source.revision!.sha256).toBe(sha256(rawProject));

    // invalid strict JSON surfaces diagnostics and failed persistence; axes
    // never impersonate verified.
    expect(source.parseError).toBeTruthy();
    expect(source.evidence.persistence).toBe('failed');
    expect(source.evidence.application).not.toBe('verified');
    expect(source.evidence.runtime).not.toBe('verified');

    // unknown path (not one of the four inventoried candidates) is rejected
    const unknown = (await service.read(
      path.join(vault, '.claude', 'not-a-settings-file.json'),
    )) as ReadResult;
    expect(unknown.status).toBe('invalid-target');

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
