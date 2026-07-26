/**
 * Tracer bullet — invalid (JSONC) managed drop-in must NOT show persistence
 * 'verified' in inventory. strict-JSON-invalid source stays exists=true with a
 * real revision and exact raw bytes, but surfaces parseError + failed evidence.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

describe('ClaudeSettingsSourceService managed drop-in strict inventory', () => {
  it('marks an invalid (JSONC) managed drop-in as failed without losing raw bytes or revision', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-dropin-invalid-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const managedConfigDir = path.join(sandbox, 'managed');
    const dropinDir = path.join(managedConfigDir, 'managed-settings.d');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    await fs.mkdir(dropinDir, { recursive: true });

    // valid JSONC (comment) but invalid strict JSON
    const invalidContent = '{\n  "hooks": {},\n  // strict JSON rejects comments\n  "unknown": 1\n}\n';
    const invalidPath = path.join(dropinDir, 'invalid.json');
    await fs.writeFile(invalidPath, invalidContent, 'utf8');

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir,
      archiveRootPath: path.join(sandbox, 'archive'),
    });

    const inventory = await service.inventory();
    const candidate = inventory.find((c) => c.origin === 'managed-drop-in' && c.path === invalidPath);
    expect(candidate).toBeDefined();
    expect(candidate!.exists).toBe(true);
    expect(candidate!.revision).not.toBeNull();
    expect(candidate!.parseError).toBeTruthy();
    expect(candidate!.evidence.persistence).toBe('failed');
    expect(candidate!.evidence.application).not.toBe('verified');
    expect(candidate!.evidence.runtime).not.toBe('verified');

    // read() preserves exact raw bytes and the same revision sha
    const readBack = await service.read(invalidPath);
    if (readBack.status !== 'success') throw new Error('unreachable');
    expect(readBack.content).toBe(invalidContent);
    expect(readBack.source.parseError).toBeTruthy();
    expect(readBack.source.revision).not.toBeNull();
    expect(readBack.source.revision!.sha256).toBe(candidate!.revision!.sha256);

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
