import { isPasswordFailure,PdfEngineError, PdfEngineLoader } from '../../../../src/core/pdf/pdfTextEngine';

describe('PdfEngineLoader (lazy, fail-closed)', () => {
  it('does not touch the filesystem until load() is called', () => {
    let dirReads = 0;
    const loader = new PdfEngineLoader({
      getPluginDir: () => { dirReads += 1; return '/nonexistent-plugin'; },
      getVaultBasePath: () => null,
    });
    expect(loader.isLoaded()).toBe(false);
    expect(dirReads).toBe(0);
  });

  it('fails closed with engine-missing when the artifact is absent', async () => {
    const loader = new PdfEngineLoader({
      getPluginDir: () => '/definitely/not/here',
      getVaultBasePath: () => null,
    });
    await expect(loader.load()).rejects.toMatchObject({
      name: 'PdfEngineError',
      failure: expect.objectContaining({ kind: 'engine-missing' }),
    });
    // Failure is not cached: a later load may succeed after a repair.
    await expect(loader.load()).rejects.toBeInstanceOf(PdfEngineError);
  });

  it('fails closed with engine-missing when the plugin dir is unavailable', async () => {
    const loader = new PdfEngineLoader({
      getPluginDir: () => undefined,
      getVaultBasePath: () => null,
    });
    await expect(loader.load()).rejects.toMatchObject({
      failure: expect.objectContaining({ kind: 'engine-missing' }),
    });
  });

  it('fails closed with engine-broken when the artifact lacks extractPages', async () => {
    const os = await import('node:os');
    const fs = await import('node:fs');
    const nodePath = await import('node:path');
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'pdf-engine-broken-'));
    fs.writeFileSync(nodePath.join(dir, 'pdf-engine.js'), 'module.exports = { broken: true };');
    const loader = new PdfEngineLoader({
      getPluginDir: () => dir,
      getVaultBasePath: () => null,
    });
    await expect(loader.load()).rejects.toMatchObject({
      failure: expect.objectContaining({ kind: 'engine-broken' }),
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loads a real CJS artifact once and caches it', async () => {
    const os = await import('node:os');
    const fs = await import('node:fs');
    const nodePath = await import('node:path');
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'pdf-engine-'));
    const artifact = nodePath.join(dir, 'pdf-engine.js');
    fs.writeFileSync(artifact, 'module.exports = { extractPages: async () => ({ pageCount: 0, pages: [] }) };');
    const loader = new PdfEngineLoader({
      getPluginDir: () => dir,
      getVaultBasePath: () => null,
    });
    const engine = await loader.load();
    expect(typeof engine.extractPages).toBe('function');
    expect(loader.isLoaded()).toBe(true);
    expect(await loader.load()).toBe(engine);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Vault-relative plugin dir (D3 live-acceptance fix): production wiring
  // passes `manifest.dir`, which Obsidian keeps VAULT-RELATIVE
  // ('.obsidian/plugins/opencodian'). Node's createRequire rejects relative
  // paths, so the loader must resolve it against the vault base path.
  // -------------------------------------------------------------------------

  it('resolves a vault-relative plugin dir (production manifest.dir shape) against the vault base path', async () => {
    const os = await import('node:os');
    const fs = await import('node:fs');
    const nodePath = await import('node:path');
    const vaultRoot = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'pdf-engine-vault-'));
    const pluginDir = nodePath.join(vaultRoot, '.obsidian', 'plugins', 'opencodian');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      nodePath.join(pluginDir, 'pdf-engine.js'),
      'module.exports = { extractPages: async () => ({ pageCount: 0, pages: [] }) };',
    );
    // Exactly the production wiring: a forward-slash vault-relative dir plus
    // the absolute adapter basePath.
    const relativeDir = '.obsidian/plugins/opencodian';
    const loader = new PdfEngineLoader({
      getPluginDir: () => relativeDir,
      getVaultBasePath: () => vaultRoot,
    });
    const engine = await loader.load();
    expect(typeof engine.extractPages).toBe('function');
    fs.rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('fails closed with engine-missing (not a raw createRequire throw) when a relative dir has no vault base path', async () => {
    const loader = new PdfEngineLoader({
      getPluginDir: () => '.obsidian/plugins/opencodian',
      getVaultBasePath: () => null,
    });
    await expect(loader.load()).rejects.toMatchObject({
      name: 'PdfEngineError',
      failure: expect.objectContaining({
        kind: 'engine-missing',
        detail: expect.stringContaining('vault-relative'),
      }),
    });
  });

  it('keeps the typed engine-missing error when a relative dir resolves to a location without the artifact', async () => {
    const os = await import('node:os');
    const fs = await import('node:fs');
    const nodePath = await import('node:path');
    const emptyVault = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'pdf-engine-empty-vault-'));
    const loader = new PdfEngineLoader({
      getPluginDir: () => '.obsidian/plugins/opencodian',
      getVaultBasePath: () => emptyVault,
    });
    await expect(loader.load()).rejects.toMatchObject({
      failure: expect.objectContaining({ kind: 'engine-missing' }),
    });
    fs.rmSync(emptyVault, { recursive: true, force: true });
  });

  // Note: the "forgetting the vault base path" class is guarded at
  // TYPECHECK level in src — `PdfEngineLoaderHost.getVaultBasePath()` is a
  // REQUIRED member and `npm run typecheck` covers src (tests/ is excluded
  // from tsc, and ts-jest diagnostics are off, so a type assertion here
  // would be a guard with no teeth). Any new src construction site that
  // omits it fails `tsc --noEmit`, not production.
});

describe('isPasswordFailure', () => {
  it('detects pdf.js PasswordException by name', () => {
    expect(isPasswordFailure({ name: 'PasswordException', message: 'No password given' })).toBe(true);
  });

  it('detects password mentions in plain errors', () => {
    expect(isPasswordFailure(new Error('password required'))).toBe(true);
  });

  it('leaves unrelated errors alone', () => {
    expect(isPasswordFailure(new Error('bad xref'))).toBe(false);
    expect(isPasswordFailure(undefined)).toBe(false);
  });
});
