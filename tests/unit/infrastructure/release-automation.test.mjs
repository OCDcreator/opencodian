const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const detectPath = path.join(process.cwd(), 'scripts', 'detect-release-version.mjs');
const publishPath = path.join(process.cwd(), 'scripts', 'publish-gitea-release.mjs');

function callDetect(options) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const mod = await import(pathToFileURL(${JSON.stringify(detectPath)}).href);
    try {
      const result = mod.detectReleaseChange(${JSON.stringify(options)});
      process.stdout.write(JSON.stringify({ ok: true, result }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || `detector exited ${result.status}`);
  return JSON.parse(result.stdout);
}

function versionFiles(version) {
  return {
    manifestText: JSON.stringify({ id: 'opencodian', version }),
    packageText: JSON.stringify({ name: 'opencodian', version }),
    lockText: JSON.stringify({ version, packages: { '': { version } } }),
  };
}

function createAssets() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-release-assets-'));
  const assetDir = path.join(root, 'artifacts', 'opencodian');
  fs.mkdirSync(assetDir, { recursive: true });
  const buffers = new Map();
  for (const name of ['main.js', 'manifest.json', 'styles.css']) {
    const buffer = Buffer.from(`${name}\n`);
    fs.writeFileSync(path.join(assetDir, name), buffer);
    buffers.set(name, buffer);
  }
  return { root, buffers };
}

function runPublisher(root, port, values = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [publishPath], {
      cwd: root,
      env: {
        ...process.env,
        GITEA_RELEASE_SERVER_URL: `http://127.0.0.1:${port}`,
        GITEA_RELEASE_REPOSITORY: 'owner/repo',
        GITEA_RELEASE_TOKEN: 'test-token',
        GITEA_RELEASE_TAG: values.tag ?? 'v1.1.0',
        GITEA_RELEASE_VERSION: values.version ?? '1.1.0',
        GITEA_RELEASE_TARGET_SHA: values.targetSha ?? 'a'.repeat(40),
        GITEA_RELEASE_PRERELEASE: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

describe('release version detection', () => {
  it('detects a strictly increasing synchronized version', () => {
    const outcome = callDetect({
      ...versionFiles('1.1.0'),
      previousManifestText: JSON.stringify({ version: '1.0.0' }),
    });
    expect(outcome).toEqual({
      ok: true,
      result: {
        changed: true,
        version: '1.1.0',
        previousVersion: '1.0.0',
        tag: 'v1.1.0',
        prerelease: false,
      },
    });
  });

  it('does not release when the manifest version is unchanged', () => {
    const outcome = callDetect({
      ...versionFiles('1.0.0'),
      previousManifestText: JSON.stringify({ version: '1.0.0' }),
    });
    expect(outcome.result.changed).toBe(false);
  });

  it('fails closed for unsynchronized or non-increasing versions', () => {
    const unsynchronized = callDetect({
      ...versionFiles('1.1.0'),
      packageText: JSON.stringify({ version: '1.0.0' }),
      previousManifestText: JSON.stringify({ version: '1.0.0' }),
    });
    expect(unsynchronized.error).toMatch(/package\.json version must match/);

    const downgrade = callDetect({
      ...versionFiles('0.9.0'),
      previousManifestText: JSON.stringify({ version: '1.0.0' }),
    });
    expect(downgrade.error).toMatch(/release version must increase/);

    const invalidPrerelease = callDetect({
      ...versionFiles('1.1.0-01'),
      previousManifestText: JSON.stringify({ version: '1.0.0' }),
    });
    expect(invalidPrerelease.error).toMatch(/leading zeroes/);
  });
});

describe('release workflow contracts', () => {
  const githubWorkflow = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'plugin-package.yml'), 'utf8');
  const giteaWorkflow = fs.readFileSync(path.join(process.cwd(), '.gitea', 'workflows', 'plugin-package.yml'), 'utf8');

  it('grants only repository content writes and detects main-branch version changes', () => {
    for (const workflow of [githubWorkflow, giteaWorkflow]) {
      expect(workflow).toContain('permissions:\n  contents: write');
      expect(workflow).toContain('node scripts/detect-release-version.mjs');
      expect(workflow).toContain("steps.release.outputs.changed == 'true'");
    }
    expect(githubWorkflow).toContain("github.ref == 'refs/heads/main'");
    expect(githubWorkflow).toContain('artifacts/opencodian/main.js');
    expect(githubWorkflow).toContain('artifacts/opencodian/manifest.json');
    expect(githubWorkflow).toContain('artifacts/opencodian/styles.css');
    expect(giteaWorkflow).toContain("gitea.ref == 'refs/heads/main'");
  });

  it('uses Node 24 release paths without personal access tokens', () => {
    expect(githubWorkflow).toContain('softprops/action-gh-release@v3');
    expect(githubWorkflow).toContain('test "$ref_sha" = "$GITHUB_SHA"');
    expect(giteaWorkflow).toContain('node scripts/publish-gitea-release.mjs');
    expect(giteaWorkflow).toContain('GITEA_RELEASE_TOKEN: ${{ secrets.GITEA_TOKEN }}');
    expect(giteaWorkflow).not.toContain('secrets.RELEASE_TOKEN');
    expect(giteaWorkflow).not.toMatch(/PERSONAL_ACCESS_TOKEN|\bPAT\b/);
    expect(giteaWorkflow).not.toContain('gitea-release-action');
  });
});

describe('Gitea release publishing', () => {
  it('creates a release at the requested commit and uploads the exact three assets', async () => {
    const fixture = createAssets();
    const targetSha = 'a'.repeat(40);
    const uploaded = [];
    const server = await startServer((request, response) => {
      expect(request.headers.authorization).toBe('token test-token');
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname.endsWith('/releases/tags/v1.1.0')) return sendJson(response, 404, {});
      if (request.method === 'POST' && url.pathname.endsWith('/releases')) {
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => {
          expect(JSON.parse(body).target_commitish).toBe(targetSha);
          sendJson(response, 201, { id: 9, tag_name: 'v1.1.0', html_url: 'https://gitea.example/release/9' });
        });
        return;
      }
      if (request.method === 'GET' && url.pathname.endsWith('/tags/v1.1.0')) {
        return sendJson(response, 200, { commit: { sha: targetSha } });
      }
      if (request.method === 'GET' && url.pathname.endsWith('/releases/9/assets')) return sendJson(response, 200, []);
      if (request.method === 'POST' && url.pathname.endsWith('/releases/9/assets')) {
        const name = url.searchParams.get('name');
        uploaded.push(name);
        request.resume();
        request.on('end', () => sendJson(response, 201, { name, size: fixture.buffers.get(name).length }));
        return;
      }
      sendJson(response, 500, { error: `unexpected ${request.method} ${url.pathname}` });
    });

    try {
      const result = await runPublisher(fixture.root, server.address().port, { targetSha });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).created).toBe(true);
      expect(uploaded).toEqual(['main.js', 'manifest.json', 'styles.css']);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('is idempotent only when the existing tag and assets match', async () => {
    const fixture = createAssets();
    const targetSha = 'b'.repeat(40);
    const assets = [...fixture.buffers.entries()].map(([name, buffer], index) => ({
      id: index + 1,
      name,
      size: buffer.length,
      browser_download_url: '',
    }));
    const server = await startServer((request, response) => {
      const url = new URL(request.url, `http://127.0.0.1:${server.address().port}`);
      for (const asset of assets) asset.browser_download_url = `http://127.0.0.1:${server.address().port}/download/${asset.name}`;
      if (url.pathname.endsWith('/releases/tags/v1.2.0')) {
        return sendJson(response, 200, { id: 10, tag_name: 'v1.2.0', html_url: 'https://gitea.example/release/10' });
      }
      if (url.pathname.endsWith('/tags/v1.2.0')) return sendJson(response, 200, { commit: { sha: targetSha } });
      if (url.pathname.endsWith('/releases/10/assets')) return sendJson(response, 200, assets);
      if (url.pathname.startsWith('/download/')) {
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return response.end(fixture.buffers.get(path.basename(url.pathname)));
      }
      return sendJson(response, 500, { error: `unexpected ${request.method} ${url.pathname}` });
    });

    try {
      const result = await runPublisher(fixture.root, server.address().port, {
        tag: 'v1.2.0', version: '1.2.0', targetSha,
      });
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.uploaded).toEqual([]);
      expect(output.skipped).toEqual(['main.js', 'manifest.json', 'styles.css']);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('refuses to modify a release whose existing tag targets another commit', async () => {
    const fixture = createAssets();
    const server = await startServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname.endsWith('/releases/tags/v2.0.0')) return sendJson(response, 200, { id: 11, tag_name: 'v2.0.0' });
      if (url.pathname.endsWith('/tags/v2.0.0')) return sendJson(response, 200, { commit: { sha: 'c'.repeat(40) } });
      return sendJson(response, 500, { error: 'unexpected request' });
    });

    try {
      const result = await runPublisher(fixture.root, server.address().port, {
        tag: 'v2.0.0', version: '2.0.0', targetSha: 'd'.repeat(40),
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/points to/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing asset with different content', async () => {
    const fixture = createAssets();
    const targetSha = 'e'.repeat(40);
    const server = await startServer((request, response) => {
      const url = new URL(request.url, `http://127.0.0.1:${server.address().port}`);
      if (url.pathname.endsWith('/releases/tags/v3.0.0')) return sendJson(response, 200, { id: 12, tag_name: 'v3.0.0' });
      if (url.pathname.endsWith('/tags/v3.0.0')) return sendJson(response, 200, { commit: { sha: targetSha } });
      if (url.pathname.endsWith('/releases/12/assets')) {
        return sendJson(response, 200, [{
          id: 1,
          name: 'main.js',
          size: fixture.buffers.get('main.js').length,
          browser_download_url: `http://127.0.0.1:${server.address().port}/download/main.js`,
        }]);
      }
      if (url.pathname === '/download/main.js') {
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return response.end(Buffer.from('different content'));
      }
      return sendJson(response, 500, { error: 'unexpected request' });
    });

    try {
      const result = await runPublisher(fixture.root, server.address().port, {
        tag: 'v3.0.0', version: '3.0.0', targetSha,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/does not match the packaged file/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
