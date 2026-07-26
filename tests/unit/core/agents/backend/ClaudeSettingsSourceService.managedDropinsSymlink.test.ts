/**
 * Tracer bullet (security) — an escaping managed-settings.d symlink must NOT be
 * silently treated as an empty directory. inventory() must fail closed (reject)
 * so an attacker cannot point managed-settings.d at an outside secret dir and
 * have it silently ignored (or, worse, enumerated).
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

describe('ClaudeSettingsSourceService managed drop-in escaping symlink', () => {
  it('rejects inventory when managed-settings.d is an escaping symlink', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-dropin-symlink-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const managedConfigDir = path.join(sandbox, 'managed');
    const external = path.join(sandbox, 'external');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    await fs.mkdir(managedConfigDir, { recursive: true });
    await fs.mkdir(external, { recursive: true });

    await fs.writeFile(path.join(managedConfigDir, 'managed-settings.json'), '{"permissions":{}}', 'utf8');
    const secretContent = '{"secret":"leak"}';
    await fs.writeFile(path.join(external, 'secret.json'), secretContent, 'utf8');

    // managed-settings.d is a symlink that escapes managedConfigDir -> external
    const dropinLink = path.join(managedConfigDir, 'managed-settings.d');
    await fs.symlink(external, dropinLink, 'dir');

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir,
      archiveRootPath: path.join(sandbox, 'archive'),
    });

    // must fail closed: inventory rejects instead of silently returning base/[]
    await expect(service.inventory()).rejects.toThrow();

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
