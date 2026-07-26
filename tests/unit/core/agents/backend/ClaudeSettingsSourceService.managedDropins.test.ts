/**
 * Tracer bullet (Slice-A) — managed-settings.d strict JSON read-only inventory.
 *
 * Injects a managedConfigDir with managed-settings.json + managed-settings.d/
 * {a,z}.json (all strict JSON). inventory must surface the base plus two
 * managed-drop-in candidates in stable alpha order, all read-only; read() on a
 * drop-in returns exact bytes; write() on a drop-in stays read-only (dynamic
 * candidates never enter the writable allowlist).
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

type Candidate = {
  scope: string;
  origin: string;
  path: string;
  exists: boolean;
  editable: boolean;
  priority: number;
  revision: { sha256: string } | null;
  evidence: { persistence: string; application: string; runtime: string };
  parseError?: string;
};

type ReadResult =
  | { status: 'success'; source: Candidate; content: string }
  | { status: 'invalid-target' };

type WriteResult = {
  result: { status: 'read-only' | 'invalid-target' | 'success' | 'conflict' };
};

describe('ClaudeSettingsSourceService managed drop-ins', () => {
  it('invents managed-settings.d entries as read-only candidates in alpha order', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-dropins-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const managedConfigDir = path.join(sandbox, 'managed');
    const dropinDir = path.join(managedConfigDir, 'managed-settings.d');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    await fs.mkdir(dropinDir, { recursive: true });

    const managedBasePath = path.join(managedConfigDir, 'managed-settings.json');
    const aPath = path.join(dropinDir, 'a.json');
    const zPath = path.join(dropinDir, 'z.json');
    const baseContent = '{"permissions":{"deny":["Bash"]}}';
    const aContent = '{"hooks":{"Stop":[]}}';
    const zContent = '{"hooks":{"PreToolUse":[]}}';
    await fs.writeFile(managedBasePath, baseContent, 'utf8');
    await fs.writeFile(aPath, aContent, 'utf8');
    await fs.writeFile(zPath, zContent, 'utf8');

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir,
      archiveRootPath: path.join(sandbox, 'archive'),
    });

    const inventory = (await service.inventory()) as Candidate[];

    const base = inventory.find((c) => c.origin === 'managed-file' && c.path === managedBasePath);
    const dropins = inventory.filter((c) => c.origin === 'managed-drop-in');
    expect(base).toBeDefined();
    expect(dropins.length).toBe(2);
    // stable document/UI order only (not a claim about CLI merge/execution order)
    expect(dropins[0].path).toBe(aPath);
    expect(dropins[1].path).toBe(zPath);

    for (const candidate of [base!, ...dropins]) {
      expect(candidate.scope).toBe('managed');
      expect(candidate.editable).toBe(false);
      expect(candidate.priority).toBeGreaterThanOrEqual(0);
      expect(candidate.revision).not.toBeNull();
      expect(candidate.evidence.persistence).toBe('verified');
      expect(candidate.evidence.application).not.toBe('verified');
      expect(candidate.evidence.runtime).not.toBe('verified');
    }

    // read() on a drop-in returns exact bytes, strict-valid, with a revision
    const readA = (await service.read(aPath)) as ReadResult;
    expect(readA.status).toBe('success');
    if (readA.status !== 'success') throw new Error('unreachable');
    expect(readA.content).toBe(aContent);
    expect(readA.source.parseError ?? undefined).toBeUndefined();
    expect(readA.source.revision).not.toBeNull();

    // write() on a dynamic drop-in candidate stays read-only (never writable)
    const writeA = (await service.write({ targetPath: aPath, content: 'not json {', expectedRevision: null })) as WriteResult;
    expect(writeA.result.status).toBe('read-only');

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
