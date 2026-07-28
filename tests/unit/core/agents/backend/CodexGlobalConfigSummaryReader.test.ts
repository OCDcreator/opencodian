import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  type GlobalCodexConfigSummary,
  hashGlobalCodexConfigSummary,
  readGlobalCodexConfigSummary,
  resolveGlobalCodexConfigPath,
  sanitizeConfigUrl,
} from '../../../../../src/core/agents/backend/CodexGlobalConfigSummaryReader';

describe('resolveGlobalCodexConfigPath', () => {
  const originalCodexHome = process.env.CODEX_HOME;
  afterEach(() => {
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
  });

  it('defaults to ~/.codex/config.toml when CODEX_HOME is unset', () => {
    delete process.env.CODEX_HOME;
    const expected = path.join(os.homedir(), '.codex', 'config.toml');
    expect(resolveGlobalCodexConfigPath()).toBe(expected);
  });

  it('honors CODEX_HOME when set to a non-empty value', () => {
    process.env.CODEX_HOME = '/custom/codex/home';
    expect(resolveGlobalCodexConfigPath()).toBe('/custom/codex/home/config.toml');
  });

  it('ignores whitespace-only CODEX_HOME', () => {
    process.env.CODEX_HOME = '   ';
    const expected = path.join(os.homedir(), '.codex', 'config.toml');
    expect(resolveGlobalCodexConfigPath()).toBe(expected);
  });
});

describe('sanitizeConfigUrl', () => {
  it('strips user-info, query, and fragment', () => {
    expect(sanitizeConfigUrl('https://user:pass@proxy.example.com/v1?token=secret#frag'))
      .toBe('https://proxy.example.com/v1');
  });

  it('strips query params that may carry tokens', () => {
    expect(sanitizeConfigUrl('https://proxy.example.com/v1?api-version=2025-04-01-preview&key=leaked'))
      .toBe('https://proxy.example.com/v1');
  });

  it('strips fragments', () => {
    expect(sanitizeConfigUrl('https://proxy.example.com/v1#section'))
      .toBe('https://proxy.example.com/v1');
  });

  it('returns null for empty or non-string input', () => {
    expect(sanitizeConfigUrl(null)).toBeNull();
    expect(sanitizeConfigUrl(undefined)).toBeNull();
    expect(sanitizeConfigUrl('')).toBeNull();
    expect(sanitizeConfigUrl('   ')).toBeNull();
    expect(sanitizeConfigUrl(42)).toBeNull();
  });

  it('truncates and strips query from unparseable URLs without leaking query content', () => {
    const result = sanitizeConfigUrl('not-a-valid-url?secret=leaked');
    expect(result).toBe('not-a-valid-url');
    expect(result).not.toContain('secret');
  });

  it('P0: strips user:password@ from unparseable URLs (malformed URL fail-closed)', () => {
    // A URL that fails WHATWG parsing but contains userinfo must NOT leak it.
    const result = sanitizeConfigUrl('https://user:secret@not-a-valid-host-with-bad-chars!');
    expect(result).not.toContain('user');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('@');
  });

  it('P0: strips user:password@ from scheme-prefixed malformed URLs', () => {
    const result = sanitizeConfigUrl('https://evan:letmein@host');
    expect(result).not.toContain('evan');
    expect(result).not.toContain('letmein');
  });

  it('P0: returns null when @ cannot be safely stripped from malformed URL', () => {
    // If after heuristic stripping there is still an @, reject entirely.
    expect(sanitizeConfigUrl('weird@@not-a-url@')).toBeNull();
  });

  it('P0: preserves safe origin+path for malformed URLs without userinfo', () => {
    const result = sanitizeConfigUrl('https://proxy.example.com:8080/v1');
    expect(result).toContain('proxy.example.com');
    expect(result).not.toContain('@');
  });
});

describe('readGlobalCodexConfigSummary', () => {
  function fixture(content: string): { filePath: string; cleanup: () => Promise<void> } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cfg-'));
    const filePath = path.join(dir, 'config.toml');
    fs.writeFileSync(filePath, content, 'utf8');
    return { filePath, cleanup: async () => fsPromises.rm(dir, { recursive: true, force: true }) };
  }

  describe('missing file', () => {
    it('returns missing state for ENOENT', async () => {
      const summary = await readGlobalCodexConfigSummary({
        filePath: '/nonexistent/path/config.toml',
      });
      expect(summary.fileState).toBe('missing');
      expect(summary.lastSuccessfulRead).toBeNull();
      expect(summary.providers).toEqual([]);
    });
  });

  describe('valid readable TOML', () => {
    const VALID_TOML = `
model = "gpt-5.4"
model_provider = "proxy"
openai_base_url = "https://proxy.example.com/v1?legacy=token"

[model_providers.proxy]
name = "My Proxy"
base_url = "https://user:secret@proxy.example.com/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
query_params = { leaked = "value" }

[model_providers.azure]
name = "Azure"
base_url = "https://myproj.openai.azure.com/openai?api-version=2025-04-01-preview"
env_key = "AZURE_OPENAI_API_KEY"
wire_api = "responses"
http_headers = { Authorization = "Bearer leaked-token" }
`;

    it('extracts only safe top-level fields', async () => {
      const { filePath, cleanup } = fixture(VALID_TOML);
      try {
        const summary = await readGlobalCodexConfigSummary({ filePath });
        expect(summary.fileState).toBe('readable');
        expect(summary.model).toBe('gpt-5.4');
        expect(summary.modelProvider).toBe('proxy');
        expect(summary.lastSuccessfulRead).not.toBeNull();
      } finally {
        await cleanup();
      }
    });

    it('sanitizes openai_base_url (strips query token)', async () => {
      const { filePath, cleanup } = fixture(VALID_TOML);
      try {
        const summary = await readGlobalCodexConfigSummary({ filePath });
        expect(summary.openaiBaseUrl).toBe('https://proxy.example.com/v1');
        expect(summary.openaiBaseUrl).not.toContain('token');
      } finally {
        await cleanup();
      }
    });

    it('extracts provider summaries with sanitized base_url only', async () => {
      const { filePath, cleanup } = fixture(VALID_TOML);
      try {
        const summary = await readGlobalCodexConfigSummary({ filePath });
        expect(summary.providers).toHaveLength(2);

        const proxy = summary.providers.find((p) => p.id === 'proxy')!;
        expect(proxy.name).toBe('My Proxy');
        expect(proxy.baseUrl).toBe('https://proxy.example.com/v1');
        expect(proxy.wireApi).toBe('responses');
        expect(proxy.isDeclaredDefault).toBe(true);

        const azure = summary.providers.find((p) => p.id === 'azure')!;
        expect(azure.baseUrl).toBe('https://myproj.openai.azure.com/openai');
        expect(azure.isDeclaredDefault).toBe(false);
      } finally {
        await cleanup();
      }
    });

    it('NEVER exposes env_key, http_headers, query_params, or auth in any field', async () => {
      const { filePath, cleanup } = fixture(VALID_TOML);
      try {
        const summary = await readGlobalCodexConfigSummary({ filePath });
        const serialized = JSON.stringify(summary);
        expect(serialized).not.toContain('OPENAI_API_KEY');
        expect(serialized).not.toContain('AZURE_OPENAI_API_KEY');
        expect(serialized).not.toContain('leaked');
        expect(serialized).not.toContain('Bearer');
        expect(serialized).not.toContain('secret');
        expect(serialized).not.toContain('token');
      } finally {
        await cleanup();
      }
    });

    it('sorts providers: declared default first, then alphabetical', async () => {
      const toml = `
model_provider = "zeta"
[model_providers.alpha]
name = "Alpha"
[model_providers.zeta]
name = "Zeta"
[model_providers.beta]
name = "Beta"
`;
      const { filePath, cleanup } = fixture(toml);
      try {
        const summary = await readGlobalCodexConfigSummary({ filePath });
        expect(summary.providers.map((p) => p.id)).toEqual(['zeta', 'alpha', 'beta']);
      } finally {
        await cleanup();
      }
    });
  });

  describe('parse failure', () => {
    it('returns parse-failed without leaking raw content', async () => {
      const badToml = `
model = "gpt-5.4"
[model_providers.proxy
name = "broken
`;
      const { filePath, cleanup } = fixture(badToml);
      try {
        const summary = await readGlobalCodexConfigSummary({ filePath });
        expect(summary.fileState).toBe('parse-failed');
        expect(summary.model).toBeNull();
        expect(summary.providers).toEqual([]);
        expect(summary.lastSuccessfulRead).toBeNull();
        // Never leak raw content or error text
        const serialized = JSON.stringify(summary);
        expect(serialized).not.toContain('gpt-5.4');
        expect(serialized).not.toContain('broken');
      } finally {
        await cleanup();
      }
    });

    it('returns parse-failed when TOML root is not a table', async () => {
      const { filePath, cleanup } = fixture('just a string');
      try {
        const summary = await readGlobalCodexConfigSummary({ filePath });
        expect(summary.fileState).toBe('parse-failed');
      } finally {
        await cleanup();
      }
    });
  });

  describe('read failure', () => {
    it('returns read-failed for permission errors without leaking content', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cfg-'));
      const filePath = path.join(dir, 'config.toml');
      fs.writeFileSync(filePath, 'model = "secret-value"', 'utf8');
      fs.chmodSync(filePath, 0o000);
      try {
        // Skip on platforms where root can always read.
        if (process.getuid?.() === 0) {
          return;
        }
        const summary = await readGlobalCodexConfigSummary({ filePath });
        expect(['read-failed', 'parse-failed']).toContain(summary.fileState);
        const serialized = JSON.stringify(summary);
        expect(serialized).not.toContain('secret-value');
      } finally {
        fs.chmodSync(filePath, 0o644);
        await fsPromises.rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('never writes', () => {
    it('does not call any write API — uses injected readFile only', async () => {
      let readCalls = 0;
      const readFile = () => {
        readCalls++;
        return Promise.resolve('model = "test"');
      };
      const writeFile = jest.fn();
      const summary = await readGlobalCodexConfigSummary({
        filePath: '/fake/path.toml',
        readFile,
      });
      expect(summary.fileState).toBe('readable');
      expect(readCalls).toBe(1);
      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe('injected path resolution', () => {
    it('uses the provided filePath verbatim', async () => {
      const summary = await readGlobalCodexConfigSummary({
        filePath: '/custom/path.toml',
        readFile: () => Promise.resolve('model = "x"'),
      });
      expect(summary.filePath).toBe('/custom/path.toml');
    });
  });
});

describe('hashGlobalCodexConfigSummary', () => {
  it('produces a stable 16-char hash for the same safe fields', () => {
    const base: GlobalCodexConfigSummary = {
      fileState: 'readable',
      filePath: '/x',
      lastSuccessfulRead: '2026-01-01T00:00:00.000Z',
      model: 'gpt-5.4',
      modelProvider: 'proxy',
      openaiBaseUrl: 'https://proxy.example.com',
      providers: [],
    };
    const a = hashGlobalCodexConfigSummary(base);
    const b = hashGlobalCodexConfigSummary({ ...base, lastSuccessfulRead: '2099-12-31T00:00:00.000Z' });
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('changes when model changes', () => {
    const base: GlobalCodexConfigSummary = {
      fileState: 'readable',
      filePath: '/x',
      lastSuccessfulRead: null,
      model: 'a',
      modelProvider: null,
      openaiBaseUrl: null,
      providers: [],
    };
    expect(hashGlobalCodexConfigSummary(base))
      .not.toBe(hashGlobalCodexConfigSummary({ ...base, model: 'b' }));
  });
});
