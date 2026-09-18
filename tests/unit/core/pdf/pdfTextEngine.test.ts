import { isPasswordFailure,PdfEngineError, PdfEngineLoader } from '../../../../src/core/pdf/pdfTextEngine';

describe('PdfEngineLoader (lazy, fail-closed)', () => {
  it('does not touch the filesystem until load() is called', () => {
    let dirReads = 0;
    const loader = new PdfEngineLoader({ getPluginDir: () => { dirReads += 1; return '/nonexistent-plugin'; } });
    expect(loader.isLoaded()).toBe(false);
    expect(dirReads).toBe(0);
  });

  it('fails closed with engine-missing when the artifact is absent', async () => {
    const loader = new PdfEngineLoader({ getPluginDir: () => '/definitely/not/here' });
    await expect(loader.load()).rejects.toMatchObject({
      name: 'PdfEngineError',
      failure: expect.objectContaining({ kind: 'engine-missing' }),
    });
    // Failure is not cached: a later load may succeed after a repair.
    await expect(loader.load()).rejects.toBeInstanceOf(PdfEngineError);
  });

  it('fails closed with engine-missing when the plugin dir is unavailable', async () => {
    const loader = new PdfEngineLoader({ getPluginDir: () => undefined });
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
    const loader = new PdfEngineLoader({ getPluginDir: () => dir });
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
    const loader = new PdfEngineLoader({ getPluginDir: () => dir });
    const engine = await loader.load();
    expect(typeof engine.extractPages).toBe('function');
    expect(loader.isLoaded()).toBe(true);
    expect(await loader.load()).toBe(engine);
    fs.rmSync(dir, { recursive: true, force: true });
  });
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
