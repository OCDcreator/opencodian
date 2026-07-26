/**
 * Tracer bullet — ClaudeSettingsSourceService.applyPathEdits: strict-JSON path
 * edits as the shared data-layer seam for both the common form and the advanced
 * source editor (same draft).
 *
 * Observes:
 *   service.applyPathEdits({ targetPath, baseContent, edits, expectedRevision })
 *
 * Edits apply structure-aware to the caller's baseContent (preserving unknown
 * fields, key order, tabs, EOL), are re-validated as strict JSON, then commit
 * via the existing write CAS. The draft equals the on-disk bytes exactly.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

type PathEditsResult = {
  targetPath: string;
  draft: string;
  evidence: { persistence: string; application: string; runtime: string };
  result:
    | { status: 'success'; revision: { sha256: string } }
    | { status: 'conflict' }
    | { status: 'invalid-content' }
    | { status: 'invalid-target' }
    | { status: 'read-only' };
};

describe('ClaudeSettingsSourceService applyPathEdits', () => {
  it('applies a structured edit over strict JSON preserving unknown fields, order, tabs and EOL', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-edits-'));
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

    // strict-valid JSON: tab-indented, stable key order, with unrelated unknown
    // top-level field (unknownTop), a nested unknown (keepNested) and a tail.
    const baseContent = [
      '{',
      '\t"unknownTop": true,',
      '\t"permissions": {',
      '\t\t"allow": ["Bash(ls)"],',
      '\t\t"keepNested": {"a":1}',
      '\t},',
      '\t"hooks": {',
      '\t\t"Stop": []',
      '\t},',
      '\t"tail": 42',
      '}',
      '',
    ].join('\n');

    const projectPath = path.join(vault, '.claude', 'settings.json');
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, baseContent, 'utf8');

    const readResult = (await service.read(projectPath)) as {
      status: string;
      source: { revision: { sha256: string } | null };
    };
    expect(readResult.status).toBe('success');
    const expectedRevision = readResult.source.revision;
    expect(expectedRevision).not.toBeNull();

    const outcome = (await service.applyPathEdits({
      targetPath: projectPath,
      baseContent,
      edits: [{ path: ['permissions', 'allow'], value: ['Bash(git status)', 'Read(*)'] }],
      expectedRevision,
    })) as PathEditsResult;

    expect(outcome.result.status).toBe('success');

    // draft equals the on-disk bytes exactly (no reformat / no extra read).
    const disk = await fs.readFile(projectPath, 'utf8');
    expect(outcome.draft).toBe(disk);

    // semantic: target field updated, unrelated unknowns fully preserved.
    expect(JSON.parse(outcome.draft)).toEqual({
      unknownTop: true,
      permissions: { allow: ['Bash(git status)', 'Read(*)'], keepNested: { a: 1 } },
      hooks: { Stop: [] },
      tail: 42,
    });

    // document order preserved (proves no whole-doc stringify/reformat).
    const draft = outcome.draft;
    expect(draft.indexOf('unknownTop')).toBeLessThan(draft.indexOf('permissions'));
    expect(draft.indexOf('permissions')).toBeLessThan(draft.indexOf('hooks'));
    expect(draft.indexOf('hooks')).toBeLessThan(draft.indexOf('tail'));
    expect(draft.indexOf('keepNested')).toBeLessThan(draft.indexOf('hooks'));

    // tab indentation + LF preserved (no space normalization).
    expect(draft.includes('\t')).toBe(true);
    expect(draft.includes('\r\n')).toBe(false);

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
