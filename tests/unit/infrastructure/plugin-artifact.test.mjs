const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'package-plugin-artifact.mjs');
const buildUtilsPath = path.join(process.cwd(), 'scripts', 'build-utils.mjs');
const githubCiWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'ci.yml');
const githubWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'plugin-package.yml');
const giteaWorkflowPath = path.join(process.cwd(), '.gitea', 'workflows', 'plugin-package.yml');

function callPackagePluginArtifact(options) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
    const result = await mod.packagePluginArtifact(${JSON.stringify(options)});
    process.stdout.write(JSON.stringify(result));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Packaging subprocess exited with status ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function callGenerateBuildId(override) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const mod = await import(pathToFileURL(${JSON.stringify(buildUtilsPath)}).href);
    process.stdout.write(mod.generateBuildId());
  `;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, OPENCODIAN_BUILD_ID: override },
  });
}

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-plugin-artifact-'));
  const distDir = path.join(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'main.js'), 'console.log("plugin");\n');
  fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify({
    id: 'opencodian',
    name: 'OpenCodian',
    version: '1.2.3',
  }));
  fs.writeFileSync(path.join(distDir, 'styles.css'), '.opencodian { display: block; }\n');
  return rootDir;
}

describe('plugin artifact packaging', () => {
  it('rebuilds an exact three-file Obsidian plugin artifact with SHA-256 evidence', () => {
    const rootDir = createFixture();
    const outputDir = path.join(rootDir, 'artifacts', 'opencodian');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'stale.txt'), 'stale');

    try {
      const result = callPackagePluginArtifact({ rootDir });
      expect(result.version).toBe('1.2.3');
      expect(result.files).toEqual(['main.js', 'manifest.json', 'styles.css']);
      expect(fs.readdirSync(outputDir).sort()).toEqual(['main.js', 'manifest.json', 'styles.css']);
      expect(result.hashes['main.js']).toMatch(/^[a-f0-9]{64}$/);
      expect(fs.readFileSync(path.join(outputDir, 'main.js'), 'utf8')).toContain('plugin');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('fails closed when any required dist file is missing', () => {
    const rootDir = createFixture();
    fs.rmSync(path.join(rootDir, 'dist', 'styles.css'));

    try {
      expect(() => callPackagePluginArtifact({ rootDir })).toThrow();
      expect(fs.existsSync(path.join(rootDir, 'artifacts', 'opencodian'))).toBe(false);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('rejects source and output directory symlink traversal', () => {
    const rootDir = createFixture();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-plugin-artifact-outside-'));
    const realDist = path.join(rootDir, 'dist');

    try {
      fs.renameSync(realDist, path.join(outsideDir, 'dist'));
      fs.symlinkSync(path.join(outsideDir, 'dist'), realDist, 'dir');
      expect(() => callPackagePluginArtifact({ rootDir })).toThrow(/distDir must not traverse a symlink/);

      fs.unlinkSync(realDist);
      fs.mkdirSync(realDist);
      for (const fileName of ['main.js', 'manifest.json', 'styles.css']) {
        fs.copyFileSync(path.join(outsideDir, 'dist', fileName), path.join(realDist, fileName));
      }
      fs.symlinkSync(outsideDir, path.join(rootDir, 'artifacts'), 'dir');
      expect(() => callPackagePluginArtifact({ rootDir })).toThrow(/outputDir must not traverse a symlink/);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('rejects overlapping source and output directories before deleting anything', () => {
    const rootDir = createFixture();

    try {
      expect(() => callPackagePluginArtifact({ rootDir, outputDir: 'dist' }))
        .toThrow(/distDir and outputDir must be disjoint/);
      expect(fs.existsSync(path.join(rootDir, 'dist', 'main.js'))).toBe(true);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps GitHub and Gitea workflows aligned while using compatible artifact actions', () => {
    const githubCiWorkflow = fs.readFileSync(githubCiWorkflowPath, 'utf8');
    const githubWorkflow = fs.readFileSync(githubWorkflowPath, 'utf8');
    const giteaWorkflow = fs.readFileSync(giteaWorkflowPath, 'utf8');

    for (const workflow of [githubWorkflow, giteaWorkflow]) {
      expect(workflow).toContain('npm ci');
      expect(workflow).toContain('npm run verify');
      expect(workflow).toContain('npm run package:plugin');
      expect(workflow).toContain('artifacts/opencodian/');
      expect(workflow).toContain('opencodian-plugin-${{ github.sha }}');
      expect(workflow).toContain('OPENCODIAN_BUILD_ID: ci-${{ github.sha }}');
      expect(workflow).toContain('actions/checkout@v7');
      expect(workflow).toContain('actions/setup-node@v7');
      expect(workflow).toContain('node-version: 24');
    }

    expect(githubCiWorkflow.match(/actions\/checkout@v7/g)).toHaveLength(2);
    expect(githubCiWorkflow.match(/actions\/setup-node@v7/g)).toHaveLength(2);
    expect(githubCiWorkflow.match(/node-version: 24/g)).toHaveLength(2);
    expect(githubWorkflow).toContain('actions/upload-artifact@v7');
    expect(githubWorkflow).not.toContain('actions/upload-artifact@v3');
    expect(giteaWorkflow).toContain('https://gitea.com/actions/gitea-upload-artifact@v7');
    expect(giteaWorkflow).not.toContain('uses: actions/upload-artifact@');
    expect(giteaWorkflow).not.toContain('actions/upload-artifact@v3');
    expect(giteaWorkflow).not.toContain('GITHUB_SERVER_URL');
    expect(giteaWorkflow).toContain('PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium');
    expect(giteaWorkflow).toContain('apt-get install --yes --no-install-recommends chromium');
  });

  it('uses a validated CI override to make BUILD_ID reproducible across remotes', () => {
    const expected = 'ci-4191a60d61ca62c637e6f131e424724180f4ed1a';
    const accepted = callGenerateBuildId(expected);
    expect(accepted.status).toBe(0);
    expect(accepted.stdout).toBe(expected);

    const rejected = callGenerateBuildId('ci-build\nforged');
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('OPENCODIAN_BUILD_ID');
  });
});
