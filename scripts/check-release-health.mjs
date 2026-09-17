#!/usr/bin/env node
/**
 * check-release-health — the tripwire for a silently broken release pipeline.
 *
 * Why this exists (2026-09-17): the publish workflow only creates a release
 * when the push itself passes every gate. A red gate therefore cuts a version
 * that `versions.json` still advertises, clients walk into a 404 at
 * `releases/download/v<ver>/main.js`, and nothing tells the maintainer —
 * v1.1.2, v1.1.15, v1.1.16, v1.1.25, v1.1.26 and v1.1.27 all shipped that way
 * (the run history was red for days; the only signal was a failure mark nobody
 * was watching).
 *
 * Two independent problems are reported:
 *   1. versions.json lists a version whose release is missing, incomplete, or
 *      built from a different version's tree;
 *   2. the publish workflow's latest completed run failed.
 *
 * Either one exits non-zero, and `--notify-issue` records the finding on a
 * single tracking issue (idempotent: a repeated finding updates nothing).
 *
 * Usage:
 *   node scripts/check-release-health.mjs
 *   node scripts/check-release-health.mjs --json --repo owner/name
 *   node scripts/check-release-health.mjs --notify-issue --publish-workflow plugin-package.yml
 *   node scripts/check-release-health.mjs --versions-file ./tmp/versions.json --dry-run
 *
 * Auth: `GITHUB_TOKEN` or `GH_TOKEN`, else the `gh` CLI's stored token, else
 * unauthenticated (fine for a handful of versions, rate-limited above that).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Assets every release must carry; keep in sync with `npm run package:plugin`. */
export const REQUIRED_RELEASE_ASSETS = Object.freeze(['main.js', 'manifest.json', 'styles.css']);

const ISSUE_TITLE = '[release-health] release pipeline needs attention';
const ISSUE_MARKER = '[release-health]';
const FINGERPRINT_PREFIX = '<!-- release-health:fingerprint=';
const DEFAULT_REPO = 'OCDcreator/opencodian';
const API_ROOT = 'https://api.github.com';

function parseArgs(argv) {
  const options = {
    versionsFile: 'versions.json',
    repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
    publishWorkflow: '',
    json: false,
    notifyIssue: false,
    dryRun: false,
    onlyNewest: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--notify-issue') options.notifyIssue = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--versions-file') options.versionsFile = argv[++index] ?? '';
    else if (arg === '--repo') options.repo = argv[++index] ?? '';
    else if (arg === '--publish-workflow') options.publishWorkflow = argv[++index] ?? '';
    else if (arg === '--only-newest') options.onlyNewest = Number.parseInt(argv[++index] ?? '0', 10) || 0;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.versionsFile || !options.repo.includes('/')) {
    throw new Error('usage: check-release-health.mjs [--versions-file <path>] [--repo <owner/name>] [--publish-workflow <file>] [--json] [--notify-issue] [--dry-run] [--only-newest <n>]');
  }
  return options;
}

/** Sortable numeric triple; throws on anything that is not `x.y.z`. */
export function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (!match) throw new Error(`not a release version: ${text}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function resolveToken() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function createClient(repo, token) {
  const baseHeaders = {
    accept: 'application/vnd.github+json',
    'user-agent': 'opencodian-release-health',
  };
  if (token) baseHeaders.authorization = `Bearer ${token}`;

  const request = (url, init = {}) => fetch(url, { ...init, headers: { ...baseHeaders, ...init.headers } });
  const api = (route, init = {}) => request(`${API_ROOT}${route}`, init);
  const repoApi = (route, init = {}) => api(`/repos/${repo}${route}`, init);
  const json = async (response, label) => {
    if (!response.ok) throw new Error(`${label} -> ${response.status} ${await response.text()}`);
    return response.json();
  };
  const post = (route, body) => api(route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    repo,
    token,
    async getRelease(version) {
      const response = await repoApi(`/releases/tags/v${version}`);
      if (response.status === 404) return null;
      return json(response, `GET releases/tags/v${version}`);
    },
    async downloadAssetText(assetUrl) {
      const response = await request(assetUrl, { headers: { accept: 'application/octet-stream' } });
      if (!response.ok) throw new Error(`GET ${assetUrl} -> ${response.status} ${await response.text()}`);
      return response.text();
    },
    async latestWorkflowRun(fileName) {
      // Only main-branch runs: the publish path is the main push. A `tags: v*`
      // run replays `verify` against an old tree and is expected to fail, so it
      // says nothing about whether the pipeline still publishes.
      const response = await repoApi(`/actions/workflows/${encodeURIComponent(fileName)}/runs?per_page=1&status=completed&branch=main`);
      const body = await json(response, `GET actions/workflows/${fileName}/runs`);
      const run = body.workflow_runs?.[0];
      if (!run) return null;
      return {
        name: run.name ?? fileName,
        conclusion: run.conclusion ?? 'unknown',
        status: run.status ?? 'unknown',
        headSha: run.head_sha ?? '',
        url: run.html_url ?? '',
        createdAt: run.created_at ?? '',
      };
    },
    async findTrackingIssue() {
      const query = encodeURIComponent(`repo:${repo} is:issue is:open in:title "${ISSUE_MARKER}"`);
      const response = await api(`/search/issues?q=${query}&per_page=5`);
      const body = await json(response, 'GET search/issues');
      return (body.items ?? []).find((item) => item.title.startsWith(ISSUE_MARKER)) ?? null;
    },
    async issueComments(number) {
      const response = await repoApi(`/issues/${number}/comments?per_page=30`);
      const body = await json(response, `GET issues/${number}/comments`);
      return Array.isArray(body) ? body.map((comment) => comment.body ?? '') : [];
    },
    async createIssue(title, body) {
      return json(await post(`/repos/${repo}/issues`, { title, body }), 'POST issues');
    },
    async commentIssue(number, body) {
      return json(await post(`/repos/${repo}/issues/${number}/comments`, { body }), `POST issues/${number}/comments`);
    },
  };
}

/**
 * Check one version: release exists, carries the three assets, and the
 * published manifest declares that same version — the guard against packaging
 * one tree and tagging it with another version.
 */
async function checkVersion(client, version) {
  const release = await client.getRelease(version);
  if (!release) return { version, kind: 'missing-release', detail: `no release for tag v${version}` };

  const assets = new Map((release.assets ?? []).map((asset) => [asset.name, asset]));
  const missing = REQUIRED_RELEASE_ASSETS.filter((name) => {
    const asset = assets.get(name);
    return !asset || asset.state !== 'uploaded' || asset.size <= 0;
  });
  if (missing.length > 0) {
    return { version, kind: 'missing-assets', detail: `release v${version} is missing ${missing.join(', ')}` };
  }

  let declared;
  try {
    declared = JSON.parse(await client.downloadAssetText(assets.get('manifest.json').url)).version;
  } catch (error) {
    return { version, kind: 'unreadable-manifest', detail: `release v${version} manifest.json is unreadable (${error?.message ?? error})` };
  }
  if (declared !== version) {
    return { version, kind: 'version-mismatch', detail: `release v${version} ships manifest.json for ${declared}` };
  }
  return null;
}

/**
 * Fingerprint of the finding itself — deliberately excludes the publish run's
 * SHA, so a daily re-check of an unfixed problem stays silent instead of
 * commenting again. A changed problem list is new information and reports.
 */
function fingerprint(problems) {
  const material = problems
    .map((problem) => `${problem.version}:${problem.kind}`)
    .sort()
    .join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const versionsText = fs.readFileSync(path.resolve(process.cwd(), options.versionsFile), 'utf8');
  const listed = Object.keys(JSON.parse(versionsText));
  if (listed.length === 0) throw new Error(`${options.versionsFile} contains no versions`);

  let versions = [...listed].sort(compareVersions);
  if (options.onlyNewest > 0) versions = versions.slice(-options.onlyNewest);

  const client = createClient(options.repo, resolveToken());
  const problems = [];
  for (const version of versions) {
    const problem = await checkVersion(client, version);
    if (problem) problems.push(problem);
    if (!options.json) {
      process.stdout.write(`[release-health] ${problem ? 'FAIL' : ' OK '} v${version}${problem ? ` — ${problem.detail}` : ''}\n`);
    }
  }

  let publishRun = null;
  if (options.publishWorkflow) {
    publishRun = await client.latestWorkflowRun(options.publishWorkflow);
    if (publishRun && publishRun.conclusion !== 'success') {
      problems.push({
        version: '-',
        kind: 'pipeline-failure',
        detail: `latest ${publishRun.name} run is ${publishRun.conclusion} (${publishRun.headSha.slice(0, 8)})`,
      });
    }
    if (!options.json && publishRun) {
      process.stdout.write(`[release-health] publish workflow: ${publishRun.name} ${publishRun.conclusion} — ${publishRun.url}\n`);
    }
  }

  const summary = {
    repo: options.repo,
    checked: versions.length,
    problems,
    publishRun,
    fingerprint: fingerprint(problems),
    healthy: problems.length === 0,
  };

  if (options.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (problems.length === 0) {
    process.stdout.write(`[release-health] OK (${versions.length} versions published with complete assets)\n`);
    return 0;
  }

  if (options.notifyIssue) await notify(client, summary, options.dryRun);
  process.stdout.write(`[release-health] FAILED (${problems.length} problem(s) across ${versions.length} versions)\n`);
  return 1;
}

function buildIssueBody(summary) {
  const lines = [
    'This issue is the single tracking thread for release-health findings; a report is appended only when the set of problems changes.',
    '',
  ];
  for (const problem of summary.problems) {
    lines.push(problem.kind === 'pipeline-failure'
      ? `- **publish pipeline**: ${problem.detail}`
      : `- \`v${problem.version}\` — ${problem.detail}`);
  }
  lines.push('');
  if (summary.publishRun?.url) {
    lines.push(`Last completed \`${summary.publishRun.name}\` run: **${summary.publishRun.conclusion}** (${summary.publishRun.createdAt})`, summary.publishRun.url, '');
  }
  lines.push(
    '`versions.json` is the update index every installed client reads, so a listed version without downloadable',
    'assets becomes a 404 at `releases/download/v<ver>/main.js`. Re-run the publish flow, or publish the missing',
    'artifacts for that tag — see `docs/modules/infrastructure/scripts.md`.',
    '',
    `Checked ${summary.checked} version(s) in \`${summary.repo}\`.`,
    '',
    `${FINGERPRINT_PREFIX}${summary.fingerprint} -->`,
  );
  return lines.join('\n');
}

/**
 * One open tracking issue, commented only when the finding changes. The
 * fingerprint comment marker is what keeps a daily run from repeating itself.
 */
async function notify(client, summary, dryRun) {
  const body = buildIssueBody(summary);
  if (dryRun) {
    process.stdout.write(`[release-health] dry run — would report on "${ISSUE_TITLE}":\n${body}\n`);
    return;
  }

  const existing = await client.findTrackingIssue();
  if (existing) {
    const comments = await client.issueComments(existing.number);
    if (comments.some((comment) => comment.includes(`${FINGERPRINT_PREFIX}${summary.fingerprint} -->`))) {
      process.stdout.write(`[release-health] issue #${existing.number} already reports this finding\n`);
      return;
    }
    await client.commentIssue(existing.number, body);
    process.stdout.write(`[release-health] commented on issue #${existing.number}\n`);
    return;
  }

  const created = await client.createIssue(ISSUE_TITLE, body);
  process.stdout.write(`[release-health] opened issue #${created.number} (${created.html_url})\n`);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`[release-health] error: ${error?.message ?? error}\n`);
      process.exitCode = 2;
    });
}
