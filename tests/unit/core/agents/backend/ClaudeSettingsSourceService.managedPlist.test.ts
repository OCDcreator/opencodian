/**
 * Tracer bullet (Slice-B) — macOS per-user/device plist binary-honest path-only
 * inventory. Plist candidates are inspected by lstat (no-follow) only: binary
 * bplist is never UTF-8 decoded, never JSON parsed. read() returns content=null
 * + revision=null with no parseError; write stays read-only.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

const BUNDLE = 'com.anthropic.claudecode';

describe('ClaudeSettingsSourceService managed plist path-only inventory', () => {
  it('surfaces per-user and device plist candidates without decoding bytes', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-plist-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const prefs = path.join(sandbox, 'managed-prefs');
    const userDir = path.join(prefs, 'alice');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    await fs.mkdir(userDir, { recursive: true });

    const userPlist = path.join(userDir, `${BUNDLE}.plist`);
    const devicePlist = path.join(prefs, `${BUNDLE}.plist`);
    // binary plist (bplist00 magic) with invalid UTF-8 trailing bytes
    await fs.writeFile(userPlist, Buffer.from([0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30, 0xff, 0xfe, 0x00, 0x01]));
    // XML plist text
    await fs.writeFile(devicePlist, '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>k</key><string>v</string></dict></plist>', 'utf8');

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      managedPreferencesDir: prefs,
      username: 'alice',
      archiveRootPath: path.join(sandbox, 'archive'),
    });

    const inventory = await service.inventory();
    const userCandidate = inventory.find((c) => c.origin === 'managed-plist-user' && c.path === userPlist);
    const deviceCandidate = inventory.find((c) => c.origin === 'managed-plist-device' && c.path === devicePlist);
    expect(userCandidate).toBeDefined();
    expect(deviceCandidate).toBeDefined();
    for (const candidate of [userCandidate!, deviceCandidate!]) {
      expect(candidate.scope).toBe('managed');
      expect(candidate.format).toBe('plist');
      expect(candidate.editable).toBe(false);
      expect(candidate.exists).toBe(true);
      expect(candidate.revision).toBeNull();
      expect(candidate.evidence.persistence).toBe('unavailable');
      expect(candidate.evidence.application).not.toBe('verified');
      expect(candidate.evidence.runtime).not.toBe('verified');
    }

    // read() must not decode bytes or JSON-parse: content=null, revision=null, no parseError
    const readUser = await service.read(userPlist);
    if (readUser.status !== 'success') throw new Error('unreachable');
    expect(readUser.content).toBeNull();
    expect(readUser.source.revision).toBeNull();
    expect(readUser.source.parseError).toBeUndefined();
    expect(readUser.source.format).toBe('plist');

    const readDevice = await service.read(devicePlist);
    if (readDevice.status !== 'success') throw new Error('unreachable');
    expect(readDevice.content).toBeNull();
    expect(readDevice.source.revision).toBeNull();

    // JSON candidates keep format='json'
    const jsonCandidate = inventory.find((c) => c.origin === 'managed-file');
    expect(jsonCandidate).toBeDefined();
    expect(jsonCandidate!.format).toBe('json');

    // write on a plist target stays read-only
    const writeUser = await service.write({ targetPath: userPlist, content: '{"x":1}', expectedRevision: null });
    expect(writeUser.result.status).toBe('read-only');

    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('normalizes a relative managedPreferencesDir to an absolute candidate path', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-plist-rel-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });

    const relativePrefs = 'relative-managed-prefs';
    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      managedPreferencesDir: relativePrefs,
      username: 'alice',
      archiveRootPath: path.join(sandbox, 'archive'),
    });

    const inventory = await service.inventory();
    const resolvedPrefs = path.resolve(relativePrefs);
    const device = inventory.find((c) => c.origin === 'managed-plist-device');
    const user = inventory.find((c) => c.origin === 'managed-plist-user');
    expect(device).toBeDefined();
    expect(user).toBeDefined();
    expect(path.isAbsolute(device!.path)).toBe(true);
    expect(path.isAbsolute(user!.path)).toBe(true);
    expect(device!.path).toBe(path.join(resolvedPrefs, `${BUNDLE}.plist`));
    expect(user!.path).toBe(path.join(resolvedPrefs, 'alice', `${BUNDLE}.plist`));

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
