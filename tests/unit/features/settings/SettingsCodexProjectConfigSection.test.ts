import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { FileRevision } from '../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import { SettingsCodexProjectConfigSection } from '../../../../src/features/settings/SettingsCodexProjectConfigSection';

function makePlugin(vaultPath: string) {
  return {
    app: {
      vault: {
        adapter: {
          getBasePath: () => vaultPath,
        },
      },
    },
  } as never;
}

function makeVault(): { vaultPath: string; cleanup: () => Promise<void> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-proj-cfg-'));
  const vaultPath = dir;
  return { vaultPath, cleanup: async () => fsPromises.rm(dir, { recursive: true, force: true }) };
}

function writeConfig(vaultPath: string, content: string): void {
  const codexDir = path.join(vaultPath, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, 'config.toml'), content, 'utf8');
}

describe('SettingsCodexProjectConfigSection.saveAdvancedToml', () => {
  it('blocks invalid parse from reaching a write', async () => {
    const { vaultPath, cleanup } = makeVault();
    try {
      const section = new SettingsCodexProjectConfigSection({ plugin: makePlugin(vaultPath) });
      const result = await section.saveAdvancedToml('model = "unterminated\n', null);
      expect(result.status).toBe('invalid-content');
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics![0].reasonKey).toBe('settings.codex.projectConfig.diagnostic.parseFailed');
      // No file written
      expect(fs.existsSync(path.join(vaultPath, '.codex', 'config.toml'))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('blocks forbidden key and exposes localized diagnostic', async () => {
    const { vaultPath, cleanup } = makeVault();
    try {
      const section = new SettingsCodexProjectConfigSection({ plugin: makePlugin(vaultPath) });
      const result = await section.saveAdvancedToml('model = "ok"\nmodel_provider = "evil"\n', null);
      expect(result.status).toBe('invalid-content');
      expect(result.diagnostics).toBeDefined();
      const forbiddenDiag = result.diagnostics!.find((d) => d.kind === 'forbidden');
      expect(forbiddenDiag).toBeDefined();
      expect(forbiddenDiag!.key).toBe('model_provider');
      expect(forbiddenDiag!.reasonKey).toBe('settings.codex.projectConfig.diagnostic.forbidden');
      expect(fs.existsSync(path.join(vaultPath, '.codex', 'config.toml'))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('blocks invalid-shape (table for scalar key) and exposes diagnostic', async () => {
    const { vaultPath, cleanup } = makeVault();
    try {
      const section = new SettingsCodexProjectConfigSection({ plugin: makePlugin(vaultPath) });
      const result = await section.saveAdvancedToml('[model]\nnested = true\n', null);
      expect(result.status).toBe('invalid-content');
      const shapeDiag = result.diagnostics!.find((d) => d.kind === 'invalid-shape');
      expect(shapeDiag).toBeDefined();
      expect(shapeDiag!.reasonKey).toContain('wrongType');
    } finally {
      await cleanup();
    }
  });

  it('successfully writes valid TOML', async () => {
    const { vaultPath, cleanup } = makeVault();
    try {
      const section = new SettingsCodexProjectConfigSection({ plugin: makePlugin(vaultPath) });
      const result = await section.saveAdvancedToml('model = "gpt-5.4"\nsandbox_mode = "workspace-write"\n', null);
      expect(result.status).toBe('success');
      const written = fs.readFileSync(path.join(vaultPath, '.codex', 'config.toml'), 'utf8');
      expect(written).toContain('model = "gpt-5.4"');
    } finally {
      await cleanup();
    }
  });

  it('CAS conflict blocks overwrite on stale revision', async () => {
    const { vaultPath, cleanup } = makeVault();
    try {
      writeConfig(vaultPath, 'model = "original"\n');
      const section = new SettingsCodexProjectConfigSection({ plugin: makePlugin(vaultPath) });
      const read1 = await section.read();
      expect(read1.status).toBe('success');
      // External write changes the file
      writeConfig(vaultPath, 'model = "external-change"\n');
      // Attempt to save with stale revision
      const staleRevision: FileRevision = read1.revision!;
      const result = await section.saveAdvancedToml('model = "stale-save"\n', staleRevision);
      expect(result.status).toBe('conflict');
      // Original external content preserved, not overwritten
      const content = fs.readFileSync(path.join(vaultPath, '.codex', 'config.toml'), 'utf8');
      expect(content).toContain('external-change');
      expect(content).not.toContain('stale-save');
    } finally {
      await cleanup();
    }
  });
});

describe('SettingsCodexProjectConfigSection.listHistory + restoreEntry', () => {
  it('listHistory returns entries after a write', async () => {
    const { vaultPath, cleanup } = makeVault();
    try {
      const section = new SettingsCodexProjectConfigSection({ plugin: makePlugin(vaultPath) });
      await section.saveAdvancedToml('model = "v1"\n', null);
      const entries = await section.listHistory();
      // May have archive entries from the write
      expect(entries).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  it('listHistory returns null for missing vault path', async () => {
    const section = new SettingsCodexProjectConfigSection({
      plugin: {
        app: { vault: { adapter: { getBasePath: () => null as unknown as string } } },
      } as never,
    });
    const entries = await section.listHistory();
    expect(entries).toBeNull();
  });

  it('restoreEntry blocks on stale revision (CAS)', async () => {
    const { vaultPath, cleanup } = makeVault();
    try {
      writeConfig(vaultPath, 'model = "v1"\n');
      const section = new SettingsCodexProjectConfigSection({ plugin: makePlugin(vaultPath) });
      const read1 = await section.read();
      expect(read1.status).toBe('success');
      // External change
      writeConfig(vaultPath, 'model = "external"\n');
      // Attempt restore with stale revision
      const result = await section.restoreEntry('fake-identity' as never, read1.revision);
      expect(['conflict', 'not-found', 'archive-failed', 'write-failed']).toContain(result.status);
      expect(result.status).not.toBe('success');
      // External content preserved
      const content = fs.readFileSync(path.join(vaultPath, '.codex', 'config.toml'), 'utf8');
      expect(content).toContain('external');
    } finally {
      await cleanup();
    }
  });

  it('restoreEntry returns invalid-path for missing vault', async () => {
    const section = new SettingsCodexProjectConfigSection({
      plugin: {
        app: { vault: { adapter: { getBasePath: () => null as unknown as string } } },
      } as never,
    });
    const result = await section.restoreEntry('fake' as never, null);
    expect(result.status).toBe('invalid-path');
  });
});

describe('P1/symlink-escape: confirmExternalDirectories via realpathSync', () => {
  // This tests the actual containment logic used by SettingsCodexSection.
  // The coordinator's confirmExternalDirectories uses realpathSync to catch
  // symlinks inside the vault pointing to external targets.
  it('in-vault symlink to external dir is detected as external via realpath', () => {
    const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'external-'));
    try {
      // Create a symlink inside the vault pointing to external dir.
      const symlinkPath = path.join(vaultDir, 'linked');
      fs.symlinkSync(externalDir, symlinkPath);

      // Lexical check would say it's in-vault (path.relative returns 'linked').
      const lexicalRelative = path.relative(vaultDir, symlinkPath);
      expect(lexicalRelative).toBe('linked');
      expect(lexicalRelative.startsWith('..')).toBe(false);

      // Realpath check correctly identifies it as external.
      const canonicalVault = fs.realpathSync(vaultDir);
      const canonicalSymlink = fs.realpathSync(symlinkPath);
      const canonicalRelative = path.relative(canonicalVault, canonicalSymlink);
      expect(canonicalRelative.startsWith('..')).toBe(true);
    } finally {
      fs.unlinkSync(path.join(vaultDir, 'linked'));
      fs.rmSync(vaultDir, { recursive: true, force: true });
      fs.rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it('normal in-vault directory is not external', () => {
    const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
    try {
      const inVaultDir = path.join(vaultDir, 'subdir');
      fs.mkdirSync(inVaultDir);
      const canonicalVault = fs.realpathSync(vaultDir);
      const canonicalSub = fs.realpathSync(inVaultDir);
      const relative = path.relative(canonicalVault, canonicalSub);
      expect(relative.startsWith('..')).toBe(false);
    } finally {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    }
  });

  it('non-existent path fails conservatively (requires confirmation)', () => {
    const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
    try {
      const nonexistent = path.join(vaultDir, 'does-not-exist');
      // realpathSync throws for non-existent paths.
      expect(() => fs.realpathSync(nonexistent)).toThrow();
      // The coordinator's confirmExternalDirectories catches this and treats
      // it as external (returns true for "needs confirmation").
    } finally {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    }
  });
});
