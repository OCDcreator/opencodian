#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_ASSET_NAMES = ['main.js', 'manifest.json', 'styles.css'];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function validateOptions(options) {
  const serverUrl = new URL(options.serverUrl);
  const isLoopbackHttp = serverUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(serverUrl.hostname);
  if (serverUrl.protocol !== 'https:' && !isLoopbackHttp) {
    throw new Error('Gitea release server URL must use HTTPS');
  }
  if (!options.token) throw new Error('Gitea release token is required');
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repository ?? '')) {
    throw new Error('Gitea release repository must use owner/repo format');
  }
  if (!/^v[0-9A-Za-z.+-]+$/.test(options.tag ?? '')) throw new Error('invalid release tag');
  if (options.tag !== `v${options.version}`) throw new Error('release tag must match the requested version');
  if (!/^[a-f0-9]{40}$/i.test(options.targetSha ?? '')) throw new Error('invalid release target SHA');
  const filesByName = new Map();
  for (const filePath of options.files ?? []) {
    const name = path.basename(filePath);
    if (!REQUIRED_ASSET_NAMES.includes(name) || filesByName.has(name)) {
      throw new Error(`unexpected or duplicate release asset: ${name}`);
    }
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`release asset must be a regular file: ${name}`);
    const buffer = fs.readFileSync(filePath);
    filesByName.set(name, { filePath, buffer, size: buffer.length, digest: sha256(buffer) });
  }
  if (filesByName.size !== REQUIRED_ASSET_NAMES.length) {
    throw new Error('Gitea release requires exactly main.js, manifest.json, and styles.css');
  }
  return { serverUrl, filesByName };
}

function apiBase(serverUrl, repository) {
  const [owner, repo] = repository.split('/').map(encodeURIComponent);
  return new URL(`api/v1/repos/${owner}/${repo}/`, `${serverUrl.toString().replace(/\/$/, '')}/`);
}

async function responseDetail(response) {
  const text = await response.text();
  return text.slice(0, 1000).replace(/\s+/g, ' ').trim();
}

export async function publishGiteaRelease(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { serverUrl, filesByName } = validateOptions(options);
  const base = apiBase(serverUrl, options.repository);
  const headers = { Accept: 'application/json', Authorization: `token ${options.token}` };

  const request = async (url, init = {}, expected = [200]) => {
    const response = await fetchImpl(url, { ...init, headers: { ...headers, ...init.headers } });
    if (!expected.includes(response.status)) {
      throw new Error(`Gitea API ${init.method ?? 'GET'} ${new URL(url).pathname} returned ${response.status}: ${await responseDetail(response)}`);
    }
    return response;
  };

  const tagPath = `tags/${encodeURIComponent(options.tag)}`;
  const releaseByTagUrl = new URL(`releases/tags/${encodeURIComponent(options.tag)}`, base);
  let releaseResponse = await fetchImpl(releaseByTagUrl, { headers });
  let release;
  let created = false;

  if (releaseResponse.status === 404) {
    const createResponse = await fetchImpl(new URL('releases', base), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: options.tag,
        target_commitish: options.targetSha,
        name: `OpenCodian ${options.tag}`,
        body: `Automated OpenCodian release for version ${options.version}.\n\nCommit: ${options.targetSha}`,
        draft: false,
        prerelease: options.prerelease,
      }),
    });
    if (createResponse.status === 201) {
      release = await createResponse.json();
      created = true;
    } else if ([409, 422].includes(createResponse.status)) {
      releaseResponse = await request(releaseByTagUrl);
      release = await releaseResponse.json();
    } else {
      throw new Error(`Gitea release creation returned ${createResponse.status}: ${await responseDetail(createResponse)}`);
    }
  } else if (releaseResponse.ok) {
    release = await releaseResponse.json();
  } else {
    throw new Error(`Gitea release lookup returned ${releaseResponse.status}: ${await responseDetail(releaseResponse)}`);
  }

  if (!Number.isInteger(release?.id) || release.tag_name !== options.tag) {
    throw new Error('Gitea release response has an invalid id or tag');
  }

  const tagResponse = await request(new URL(tagPath, base));
  const tag = await tagResponse.json();
  if (tag?.commit?.sha !== options.targetSha) {
    throw new Error(`release tag ${options.tag} points to ${tag?.commit?.sha ?? 'unknown'}, expected ${options.targetSha}`);
  }

  const assetsUrl = new URL(`releases/${release.id}/assets`, base);
  const assetsResponse = await request(assetsUrl);
  const existingAssets = await assetsResponse.json();
  const existingByName = new Map(existingAssets.map((asset) => [asset.name, asset]));
  const uploaded = [];
  const skipped = [];

  for (const name of REQUIRED_ASSET_NAMES) {
    const expected = filesByName.get(name);
    const existing = existingByName.get(name);
    if (existing) {
      const downloadUrl = new URL(existing.browser_download_url);
      if (downloadUrl.origin !== serverUrl.origin) {
        throw new Error(`release asset ${name} points outside the Gitea origin`);
      }
      const downloadResponse = await request(downloadUrl);
      const remoteBuffer = Buffer.from(await downloadResponse.arrayBuffer());
      if (remoteBuffer.length !== expected.size || sha256(remoteBuffer) !== expected.digest) {
        throw new Error(`existing release asset ${name} does not match the packaged file`);
      }
      skipped.push(name);
      continue;
    }

    const form = new FormData();
    form.append('attachment', new Blob([expected.buffer]), name);
    const uploadUrl = new URL(assetsUrl);
    uploadUrl.searchParams.set('name', name);
    const uploadResponse = await request(uploadUrl, { method: 'POST', body: form }, [201]);
    const uploadedAsset = await uploadResponse.json();
    if (uploadedAsset?.name !== name || uploadedAsset?.size !== expected.size) {
      throw new Error(`Gitea returned invalid metadata for uploaded release asset ${name}`);
    }
    uploaded.push(name);
  }

  const result = { created, releaseId: release.id, url: release.html_url, uploaded, skipped };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

function optionsFromEnvironment() {
  return {
    serverUrl: process.env.GITEA_RELEASE_SERVER_URL,
    repository: process.env.GITEA_RELEASE_REPOSITORY,
    token: process.env.GITEA_RELEASE_TOKEN,
    tag: process.env.GITEA_RELEASE_TAG,
    version: process.env.GITEA_RELEASE_VERSION,
    targetSha: process.env.GITEA_RELEASE_TARGET_SHA,
    prerelease: process.env.GITEA_RELEASE_PRERELEASE === 'true',
    files: REQUIRED_ASSET_NAMES.map((name) => path.join(process.cwd(), 'artifacts', 'opencodian', name)),
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    await publishGiteaRelease(optionsFromEnvironment());
  } catch (error) {
    console.error(`[gitea-release] ${error.message}`);
    process.exitCode = 1;
  }
}
