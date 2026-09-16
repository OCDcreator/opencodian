import type { App, DataAdapter, RequestUrlParam, RequestUrlResponse } from 'obsidian';
/** Shared fixtures for the PluginUpdateService test split (jest testMatch ignores this module). */
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { PluginUpdateService } from '../../../../src/core/update/PluginUpdateService';

Object.assign(globalThis, { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder });

const encoder = new NodeTextEncoder();
const decoder = new NodeTextDecoder();
export const PLUGIN_DIR = '.obsidian/plugins/opencodian';
export const GITHUB_INDEX_URL = 'https://raw.githubusercontent.com/OCDcreator/opencodian/main/versions.json';
export const GITEA_INDEX_URL = 'https://gitea.ltreen.tech/OCDcreator/opencodian/raw/branch/main/versions.json';

export function binary(value: string): ArrayBuffer {
  return encoder.encode(value).buffer;
}

export function text(value: ArrayBuffer): string {
  return decoder.decode(value);
}

export function manifest(version: string, minAppVersion = '1.4.5'): string {
  return JSON.stringify({
    id: 'opencodian',
    name: 'OpenCodian',
    version,
    minAppVersion,
  });
}

export function response(
  status: number,
  body: unknown = null,
  buffer: ArrayBuffer = binary(typeof body === 'string' ? body : JSON.stringify(body)),
): RequestUrlResponse {
  return {
    status,
    headers: {},
    json: body,
    text: typeof body === 'string' ? body : JSON.stringify(body),
    arrayBuffer: buffer,
  };
}

export class MemoryAdapter {
  readonly files = new Map<string, ArrayBuffer>();
  readonly folders = new Set<string>(['.obsidian', '.obsidian/plugins', PLUGIN_DIR]);
  failWritePath: string | null = null;

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const value = this.files.get(path);
    if (!value) throw new Error(`Missing ${path}`);
    return value.slice(0);
  }

  async read(path: string): Promise<string> {
    return text(await this.readBinary(path));
  }

  async writeBinary(path: string, value: ArrayBuffer): Promise<void> {
    if (this.failWritePath === path) {
      this.failWritePath = null;
      throw new Error(`Write failed for ${path}`);
    }
    this.files.set(path, value.slice(0));
  }

  async write(path: string, value: string): Promise<void> {
    await this.writeBinary(path, binary(value));
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    const prefix = `${path}/`;
    const folders = [...this.folders].filter((folder) => {
      if (!folder.startsWith(prefix)) return false;
      return !folder.slice(prefix.length).includes('/');
    });
    const files = [...this.files.keys()].filter((file) => {
      if (!file.startsWith(prefix)) return false;
      return !file.slice(prefix.length).includes('/');
    });
    return { files, folders };
  }

  async rmdir(path: string): Promise<void> {
    const prefix = `${path}/`;
    for (const file of [...this.files.keys()]) {
      if (file === path || file.startsWith(prefix)) this.files.delete(file);
    }
    for (const folder of [...this.folders]) {
      if (folder === path || folder.startsWith(prefix)) this.folders.delete(folder);
    }
  }

  seedPackage(version: string, marker: string): void {
    this.files.set(`${PLUGIN_DIR}/main.js`, binary(`main-${marker}`));
    this.files.set(`${PLUGIN_DIR}/manifest.json`, binary(manifest(version)));
    this.files.set(`${PLUGIN_DIR}/styles.css`, binary(`styles-${marker}`));
  }
}

export function releaseAssetUrl(version: string, assetName: string, source = 'github'): string {
  const baseUrl = source === 'github'
    ? 'https://github.com/OCDcreator/opencodian'
    : 'https://gitea.ltreen.tech/OCDcreator/opencodian';
  return `${baseUrl}/releases/download/v${version}/${assetName}`;
}

export function releasePackage(
  version: string,
  options: { source?: string; minAppVersion?: string; main?: RequestUrlResponse; styles?: RequestUrlResponse } = {},
): Record<string, RequestUrlResponse> {
  const source = options.source ?? 'github';
  const minimum = options.minAppVersion ?? '1.4.5';
  return {
    [releaseAssetUrl(version, 'manifest.json', source)]: response(200, manifest(version, minimum), binary(manifest(version, minimum))),
    [releaseAssetUrl(version, 'main.js', source)]: options.main ?? response(200, 'main-new', binary('main-new')),
    [releaseAssetUrl(version, 'styles.css', source)]: options.styles ?? response(200, 'styles-new', binary('styles-new')),
  };
}

export function createService(options: {
  adapter?: MemoryAdapter;
  request: (request: RequestUrlParam | string) => Promise<RequestUrlResponse>;
  supported?: (version: string) => boolean;
  now?: () => number;
}): { service: PluginUpdateService; adapter: MemoryAdapter; persist: jest.Mock } {
  const adapter = options.adapter ?? new MemoryAdapter();
  adapter.seedPackage('1.0.0', 'old');
  const persist = jest.fn().mockResolvedValue(undefined);
  const service = new PluginUpdateService({
    app: {
      vault: {
        configDir: '.obsidian',
        adapter: adapter as unknown as DataAdapter,
      },
    } as App,
    manifest: {
      id: 'opencodian',
      version: '1.0.0',
      dir: PLUGIN_DIR,
    } as never,
    request: options.request,
    isApiVersionSupported: options.supported ?? (() => true),
    persistState: persist,
    now: options.now ?? (() => 1000),
  });
  return { service, adapter, persist };
}

export function githubRequest(index: Record<string, string>, extra: Record<string, RequestUrlResponse> = {}) {
  return jest.fn(async (input: RequestUrlParam | string) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === GITHUB_INDEX_URL) return response(200, index);
    const matched = extra[url];
    if (matched) return matched;
    throw new Error(`Unexpected URL ${url}`);
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
