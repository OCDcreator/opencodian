/* eslint-disable max-lines -- One security-critical owner keeps the release, backup, and rollback transaction together. */
import {
  type App,
  type DataAdapter,
  normalizePath,
  type PluginManifest,
  requestUrl,
  type RequestUrlParam,
  type RequestUrlResponse,
  requireApiVersion,
} from 'obsidian';

const PLUGIN_ID = 'opencodian';
const REQUIRED_ASSET_NAMES = ['main.js', 'manifest.json', 'styles.css'] as const;
const BACKUP_DIRECTORY_NAME = '.opencodian-update-backups';
const BACKUP_METADATA_FILE = 'backup.json';
const PAGE_SIZE = 100;
const MAX_RELEASE_PAGES = 500;
const MAX_BACKUPS = 3;

type RequiredAssetName = typeof REQUIRED_ASSET_NAMES[number];

export type PluginUpdateSource = 'github' | 'gitea';
export type PluginUpdateStatus = 'idle' | 'checking' | 'ready' | 'error';

export interface PluginUpdatePersistedState {
  lastCheckAt: number | null;
  lastNotifiedVersion: string | null;
  latestStableVersion: string | null;
  lastSource: PluginUpdateSource | null;
}

export const DEFAULT_PLUGIN_UPDATE_PERSISTED_STATE: PluginUpdatePersistedState = {
  lastCheckAt: null,
  lastNotifiedVersion: null,
  latestStableVersion: null,
  lastSource: null,
};

export interface PluginUpdateRelease {
  readonly kind: 'release';
  readonly source: PluginUpdateSource;
  readonly version: string;
  readonly tagName: string;
  readonly publishedAt: string | null;
  readonly releaseUrl: string | null;
  readonly minAppVersion: string | null;
  readonly compatible: boolean;
  readonly installable: boolean;
  readonly unavailableReason: string | null;
}

export interface PluginUpdateBackup {
  readonly kind: 'backup';
  readonly id: string;
  readonly version: string;
  readonly capturedAt: number;
  readonly minAppVersion: string | null;
  readonly compatible: boolean;
  readonly installable: boolean;
  readonly unavailableReason: string | null;
}

export interface PluginUpdateSnapshot {
  readonly status: PluginUpdateStatus;
  readonly source: PluginUpdateSource | null;
  readonly currentVersion: string;
  readonly latestRelease: PluginUpdateRelease | null;
  readonly releases: readonly PluginUpdateRelease[];
  readonly backups: readonly PluginUpdateBackup[];
  readonly error: string | null;
  readonly isApplying: boolean;
}

export interface PluginUpdateInstallResult {
  readonly previousVersion: string;
  readonly installedVersion: string;
  readonly source: PluginUpdateSource | 'backup';
}

export type PluginUpdateRequest = (request: RequestUrlParam | string) => Promise<RequestUrlResponse>;

export interface PluginUpdateServiceOptions {
  app: App;
  manifest: PluginManifest;
  initialState?: PluginUpdatePersistedState;
  persistState?: (state: PluginUpdatePersistedState) => Promise<void>;
  request?: PluginUpdateRequest;
  isApiVersionSupported?: (version: string) => boolean;
  now?: () => number;
}

interface ReleaseAsset {
  name: RequiredAssetName;
  url: string;
}

interface ReleaseCandidate {
  source: PluginUpdateSource;
  version: string;
  tagName: string;
  publishedAt: string | null;
  releaseUrl: string | null;
  assets: Map<RequiredAssetName, ReleaseAsset>;
  minAppVersion: string | null;
  compatible: boolean;
  installable: boolean;
  unavailableReason: string | null;
}

interface PluginPackage {
  version: string;
  minAppVersion: string;
  files: Record<RequiredAssetName, ArrayBuffer>;
}

interface BackupMetadata {
  schemaVersion: 1;
  version: string;
  minAppVersion: string;
  capturedAt: number;
}

class SourceUnavailableError extends Error {}

class PackageValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function cloneArrayBuffer(value: ArrayBuffer): ArrayBuffer {
  return value.slice(0);
}

function arrayBuffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

function formatError(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'Unknown update error';
}

function parseVersion(value: string): { major: number; minor: number; patch: number } | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$/u.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Compare stable Semantic Versions. Invalid and prerelease values are rejected. */
export function comparePluginVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new PackageValidationError('Only stable Semantic Versions can be compared.');
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function toText(data: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

function parseManifest(data: ArrayBuffer, expectedVersion?: string): { version: string; minAppVersion: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(toText(data));
  } catch {
    throw new PackageValidationError('manifest.json is not valid JSON.');
  }
  if (!isRecord(parsed)) throw new PackageValidationError('manifest.json must contain an object.');
  if (parsed.id !== PLUGIN_ID) throw new PackageValidationError('manifest.json does not belong to OpenCodian.');
  const version = readString(parsed.version);
  const minAppVersion = readString(parsed.minAppVersion);
  if (!version || !parseVersion(version)) {
    throw new PackageValidationError('manifest.json has an invalid stable version.');
  }
  if (!minAppVersion || !parseVersion(minAppVersion)) {
    throw new PackageValidationError('manifest.json has an invalid stable minAppVersion.');
  }
  if (expectedVersion && version !== expectedVersion) {
    throw new PackageValidationError(`manifest.json version ${version} does not match ${expectedVersion}.`);
  }
  return { version, minAppVersion };
}

function normalizePersistedState(value: PluginUpdatePersistedState | undefined): PluginUpdatePersistedState {
  return {
    lastCheckAt: typeof value?.lastCheckAt === 'number' && Number.isFinite(value.lastCheckAt)
      ? value.lastCheckAt
      : null,
    lastNotifiedVersion: typeof value?.lastNotifiedVersion === 'string' && parseVersion(value.lastNotifiedVersion)
      ? value.lastNotifiedVersion
      : null,
    latestStableVersion: typeof value?.latestStableVersion === 'string' && parseVersion(value.latestStableVersion)
      ? value.latestStableVersion
      : null,
    lastSource: value?.lastSource === 'github' || value?.lastSource === 'gitea'
      ? value.lastSource
      : null,
  };
}

function releaseEndpoint(source: PluginUpdateSource, page: number): string {
  if (source === 'github') {
    return `https://api.github.com/repos/OCDcreator/opencodian/releases?per_page=${PAGE_SIZE}&page=${page}`;
  }
  return `https://gitea.ltreen.tech/api/v1/repos/OCDcreator/opencodian/releases?limit=${PAGE_SIZE}&page=${page}`;
}

function sourceHeaders(source: PluginUpdateSource): Record<string, string> {
  return source === 'github'
    ? { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenCodian-plugin-update-check' }
    : { Accept: 'application/json' };
}

function asReleaseAssets(value: unknown): Map<RequiredAssetName, ReleaseAsset> {
  const assets = new Map<RequiredAssetName, ReleaseAsset>();
  if (!Array.isArray(value)) return assets;
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = readString(entry.name);
    const url = readString(entry.browser_download_url) ?? readString(entry.download_url);
    if (!name || !url || !REQUIRED_ASSET_NAMES.includes(name as RequiredAssetName)) continue;
    if (!isHttpUrl(url)) continue;
    const assetName = name as RequiredAssetName;
    if (assets.has(assetName)) {
      throw new PackageValidationError(`Release has duplicate ${assetName} assets.`);
    }
    assets.set(assetName, { name: assetName, url });
  }
  return assets;
}

function releaseFromPayload(
  source: PluginUpdateSource,
  payload: unknown,
): ReleaseCandidate | null {
  if (!isRecord(payload)) return null;
  if (readBoolean(payload.draft) || readBoolean(payload.prerelease)) return null;
  const tagName = readString(payload.tag_name);
  if (!tagName || !tagName.startsWith('v')) return null;
  const version = tagName.slice(1);
  if (!parseVersion(version)) return null;
  const assets = asReleaseAssets(payload.assets ?? payload.attachments);
  return {
    source,
    version,
    tagName,
    publishedAt: readString(payload.published_at),
    releaseUrl: readString(payload.html_url),
    assets,
    minAppVersion: null,
    compatible: false,
    installable: false,
    unavailableReason: null,
  };
}

function toPublicRelease(candidate: ReleaseCandidate): PluginUpdateRelease {
  return {
    kind: 'release',
    source: candidate.source,
    version: candidate.version,
    tagName: candidate.tagName,
    publishedAt: candidate.publishedAt,
    releaseUrl: candidate.releaseUrl,
    minAppVersion: candidate.minAppVersion,
    compatible: candidate.compatible,
    installable: candidate.installable,
    unavailableReason: candidate.unavailableReason,
  };
}

export class PluginUpdateService {
  private readonly app: App;
  private readonly manifest: PluginManifest;
  private readonly request: PluginUpdateRequest;
  private readonly isApiVersionSupported: (version: string) => boolean;
  private readonly now: () => number;
  private readonly persistState?: (state: PluginUpdatePersistedState) => Promise<void>;
  private persistedState: PluginUpdatePersistedState;
  private snapshot: PluginUpdateSnapshot;
  private candidates = new Map<string, ReleaseCandidate>();
  private backups = new Map<string, PluginUpdateBackup>();
  private checkPromise: Promise<PluginUpdateSnapshot> | null = null;
  private applyPromise: Promise<PluginUpdateInstallResult> | null = null;
  private backupSequence = 0;

  constructor(options: PluginUpdateServiceOptions) {
    this.app = options.app;
    this.manifest = options.manifest;
    this.request = options.request ?? requestUrl;
    this.isApiVersionSupported = options.isApiVersionSupported ?? requireApiVersion;
    this.now = options.now ?? Date.now;
    this.persistState = options.persistState;
    this.persistedState = normalizePersistedState(options.initialState);
    this.snapshot = {
      status: 'idle',
      source: this.persistedState.lastSource,
      currentVersion: this.manifest.version,
      latestRelease: null,
      releases: [],
      backups: [],
      error: null,
      isApplying: false,
    };
  }

  getSnapshot(): PluginUpdateSnapshot {
    return this.snapshot;
  }

  getPersistedState(): PluginUpdatePersistedState {
    return { ...this.persistedState };
  }

  async markVersionNotified(version: string): Promise<void> {
    if (!parseVersion(version)) return;
    this.persistedState = { ...this.persistedState, lastNotifiedVersion: version };
    await this.persist();
  }

  async checkForUpdates(): Promise<PluginUpdateSnapshot> {
    if (this.checkPromise) return this.checkPromise;
    if (this.applyPromise) throw new Error('An installation is already in progress.');

    this.snapshot = { ...this.snapshot, status: 'checking', error: null };
    this.checkPromise = this.checkForUpdatesInternal();
    try {
      return await this.checkPromise;
    } finally {
      this.checkPromise = null;
    }
  }

  async installLatestStable(): Promise<PluginUpdateInstallResult> {
    const latest = this.snapshot.latestRelease;
    if (!latest) throw new Error('No stable release is available yet.');
    return this.installRelease(latest.version);
  }

  async installRelease(version: string): Promise<PluginUpdateInstallResult> {
    const candidate = this.candidates.get(version);
    if (!candidate) throw new Error(`Release ${version} is not in the checked version list.`);
    if (!candidate.installable) {
      throw new Error(candidate.unavailableReason ?? `Release ${version} cannot be installed.`);
    }
    return this.runExclusive(async () => {
      const packageToInstall = await this.downloadReleasePackage(candidate);
      const result = await this.applyPackage(packageToInstall, candidate.source);
      await this.refreshBackups();
      return result;
    });
  }

  async restoreBackup(id: string): Promise<PluginUpdateInstallResult> {
    const backup = this.backups.get(id);
    if (!backup) throw new Error('The selected local backup is no longer available.');
    if (!backup.installable) {
      throw new Error(backup.unavailableReason ?? 'The selected local backup cannot be restored.');
    }
    return this.runExclusive(async () => {
      const packageToInstall = await this.readBackupPackage(id, backup.version);
      const result = await this.applyPackage(packageToInstall, 'backup');
      await this.refreshBackups();
      return result;
    });
  }

  private async checkForUpdatesInternal(): Promise<PluginUpdateSnapshot> {
    try {
      const listed = await this.listReleaseCandidatesWithFallback();
      const releases = await Promise.all(listed.map((candidate) => this.inspectReleaseCandidate(candidate)));
      this.candidates = new Map(releases.map((candidate) => [candidate.version, candidate]));
      await this.refreshBackups();
      const publicReleases = releases.map(toPublicRelease);
      const latestRelease = publicReleases[0] ?? null;
      this.persistedState = {
        ...this.persistedState,
        lastCheckAt: this.now(),
        latestStableVersion: latestRelease?.version ?? null,
        lastSource: latestRelease?.source ?? null,
      };
      await this.persist();
      this.snapshot = {
        status: 'ready',
        source: latestRelease?.source ?? null,
        currentVersion: this.manifest.version,
        latestRelease,
        releases: publicReleases,
        backups: [...this.backups.values()].sort((left, right) => right.capturedAt - left.capturedAt),
        error: null,
        isApplying: false,
      };
      return this.snapshot;
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        error: formatError(error),
        isApplying: false,
      };
      return this.snapshot;
    }
  }

  private async listReleaseCandidatesWithFallback(): Promise<ReleaseCandidate[]> {
    try {
      return await this.listReleaseCandidates('github');
    } catch (error) {
      if (!(error instanceof SourceUnavailableError)) throw error;
      return this.listReleaseCandidates('gitea');
    }
  }

  private async listReleaseCandidates(source: PluginUpdateSource): Promise<ReleaseCandidate[]> {
    const candidates: ReleaseCandidate[] = [];
    for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
      const response = await this.requestReleasePage(source, page);
      if (!Array.isArray(response)) {
        throw new PackageValidationError(`${source} returned an invalid release list.`);
      }
      for (const item of response) {
        const candidate = releaseFromPayload(source, item);
        if (candidate) candidates.push(candidate);
      }
      if (response.length < PAGE_SIZE) break;
      if (page === MAX_RELEASE_PAGES) {
        throw new PackageValidationError('Release history exceeds the safe pagination limit.');
      }
    }

    const versions = new Set<string>();
    for (const candidate of candidates) {
      if (versions.has(candidate.version)) {
        throw new PackageValidationError(`Release history contains duplicate version ${candidate.version}.`);
      }
      versions.add(candidate.version);
    }
    return candidates.sort((left, right) => comparePluginVersions(right.version, left.version));
  }

  private async requestReleasePage(source: PluginUpdateSource, page: number): Promise<unknown> {
    let response: RequestUrlResponse;
    try {
      response = await this.request({
        url: releaseEndpoint(source, page),
        method: 'GET',
        headers: sourceHeaders(source),
        throw: false,
      });
    } catch (error) {
      throw new SourceUnavailableError(`${source} release service is unavailable: ${formatError(error)}`);
    }
    const rateLimitRemaining = response.headers['x-ratelimit-remaining'] ?? response.headers['X-RateLimit-Remaining'];
    if (response.status === 429 || response.status >= 500 || (response.status === 403 && rateLimitRemaining === '0')) {
      throw new SourceUnavailableError(`${source} release service returned ${response.status}.`);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new PackageValidationError(`${source} release service returned ${response.status}.`);
    }
    return response.json;
  }

  private async inspectReleaseCandidate(candidate: ReleaseCandidate): Promise<ReleaseCandidate> {
    const manifestAsset = candidate.assets.get('manifest.json');
    if (!manifestAsset || REQUIRED_ASSET_NAMES.some((asset) => !candidate.assets.has(asset))) {
      return { ...candidate, unavailableReason: 'Release is missing one or more required plugin assets.' };
    }
    try {
      const manifestResponse = await this.request({ url: manifestAsset.url, method: 'GET', throw: false });
      if (manifestResponse.status < 200 || manifestResponse.status >= 300) {
        throw new PackageValidationError(`manifest.json download returned ${manifestResponse.status}.`);
      }
      const parsed = parseManifest(manifestResponse.arrayBuffer, candidate.version);
      const compatible = this.isApiVersionSupported(parsed.minAppVersion);
      return {
        ...candidate,
        minAppVersion: parsed.minAppVersion,
        compatible,
        installable: compatible,
        unavailableReason: compatible ? null : `Requires Obsidian ${parsed.minAppVersion} or later.`,
      };
    } catch (error) {
      return { ...candidate, unavailableReason: formatError(error) };
    }
  }

  private async downloadReleasePackage(candidate: ReleaseCandidate): Promise<PluginPackage> {
    const files = {} as Record<RequiredAssetName, ArrayBuffer>;
    for (const assetName of REQUIRED_ASSET_NAMES) {
      const asset = candidate.assets.get(assetName);
      if (!asset) throw new PackageValidationError(`Release ${candidate.version} is missing ${assetName}.`);
      const response = await this.request({ url: asset.url, method: 'GET', throw: false });
      if (response.status < 200 || response.status >= 300) {
        throw new PackageValidationError(`${assetName} download returned ${response.status}.`);
      }
      if (assetName === 'main.js' && response.arrayBuffer.byteLength === 0) {
        throw new PackageValidationError('main.js cannot be empty.');
      }
      files[assetName] = cloneArrayBuffer(response.arrayBuffer);
    }
    const parsed = parseManifest(files['manifest.json'], candidate.version);
    if (!this.isApiVersionSupported(parsed.minAppVersion)) {
      throw new PackageValidationError(`Release ${candidate.version} requires Obsidian ${parsed.minAppVersion} or later.`);
    }
    return { version: parsed.version, minAppVersion: parsed.minAppVersion, files };
  }

  private async runExclusive(action: () => Promise<PluginUpdateInstallResult>): Promise<PluginUpdateInstallResult> {
    if (this.applyPromise) throw new Error('Another version installation is already in progress.');
    this.snapshot = { ...this.snapshot, isApplying: true, error: null };
    this.applyPromise = action();
    try {
      const result = await this.applyPromise;
      this.snapshot = {
        ...this.snapshot,
        isApplying: false,
        currentVersion: result.installedVersion,
        backups: [...this.backups.values()].sort((left, right) => right.capturedAt - left.capturedAt),
      };
      return result;
    } catch (error) {
      this.snapshot = { ...this.snapshot, isApplying: false, error: formatError(error) };
      throw error;
    } finally {
      this.applyPromise = null;
    }
  }

  private async applyPackage(packageToInstall: PluginPackage, source: PluginUpdateSource | 'backup'): Promise<PluginUpdateInstallResult> {
    const installed = await this.readInstalledPackage();
    await this.writeBackup(installed);
    try {
      await this.writePackageToPluginDirectory(packageToInstall);
      await this.verifyInstalledPackage(packageToInstall);
    } catch (error) {
      try {
        await this.writePackageToPluginDirectory(installed);
        await this.verifyInstalledPackage(installed);
      } catch (restoreError) {
        throw new Error(`${formatError(error)} Original package restoration also failed: ${formatError(restoreError)}`);
      }
      throw error;
    }
    return {
      previousVersion: installed.version,
      installedVersion: packageToInstall.version,
      source,
    };
  }

  private pluginDirectory(): string {
    const configDir = normalizePath(this.app.vault.configDir);
    const defaultDirectory = normalizePath(`${configDir}/plugins/${this.manifest.id}`);
    const declaredDirectory = this.manifest.dir?.trim()
      ? normalizePath(this.manifest.dir)
      : defaultDirectory;
    if (declaredDirectory !== defaultDirectory) {
      throw new PackageValidationError('The installed plugin directory does not match the configured OpenCodian plugin directory.');
    }
    return declaredDirectory;
  }

  private assetPath(assetName: RequiredAssetName): string {
    return normalizePath(`${this.pluginDirectory()}/${assetName}`);
  }

  private backupRoot(): string {
    return normalizePath(`${this.pluginDirectory()}/${BACKUP_DIRECTORY_NAME}`);
  }

  private adapter(): DataAdapter {
    return this.app.vault.adapter;
  }

  private async readInstalledPackage(): Promise<PluginPackage> {
    const files = await this.readPackageFiles(this.pluginDirectory());
    const parsed = parseManifest(files['manifest.json']);
    return { version: parsed.version, minAppVersion: parsed.minAppVersion, files };
  }

  private async readPackageFiles(directory: string): Promise<Record<RequiredAssetName, ArrayBuffer> > {
    const adapter = this.adapter();
    const files = {} as Record<RequiredAssetName, ArrayBuffer>;
    for (const assetName of REQUIRED_ASSET_NAMES) {
      const path = normalizePath(`${directory}/${assetName}`);
      if (!(await adapter.exists(path))) {
        throw new PackageValidationError(`Required installed asset is missing: ${assetName}.`);
      }
      files[assetName] = cloneArrayBuffer(await adapter.readBinary(path));
    }
    return files;
  }

  private async verifyInstalledPackage(expected: PluginPackage): Promise<void> {
    const actual = await this.readInstalledPackage();
    if (actual.version !== expected.version || actual.minAppVersion !== expected.minAppVersion) {
      throw new PackageValidationError('Installed manifest did not match the selected package.');
    }
    for (const assetName of REQUIRED_ASSET_NAMES) {
      if (!arrayBuffersEqual(actual.files[assetName], expected.files[assetName])) {
        throw new PackageValidationError(`Installed ${assetName} did not match the selected package.`);
      }
    }
  }

  private async writePackageToPluginDirectory(packageToWrite: PluginPackage): Promise<void> {
    const adapter = this.adapter();
    for (const assetName of REQUIRED_ASSET_NAMES) {
      await adapter.writeBinary(this.assetPath(assetName), cloneArrayBuffer(packageToWrite.files[assetName]));
    }
  }

  private async writeBackup(installed: PluginPackage): Promise<void> {
    const root = this.backupRoot();
    await this.ensureDirectory(root);
    this.backupSequence += 1;
    const id = `${this.now()}-${this.backupSequence}-${installed.version.replace(/[^0-9A-Za-z.-]/gu, '_')}`;
    const directory = normalizePath(`${root}/${id}`);
    await this.ensureDirectory(directory);
    const adapter = this.adapter();
    for (const assetName of REQUIRED_ASSET_NAMES) {
      await adapter.writeBinary(normalizePath(`${directory}/${assetName}`), cloneArrayBuffer(installed.files[assetName]));
    }
    const metadata: BackupMetadata = {
      schemaVersion: 1,
      version: installed.version,
      minAppVersion: installed.minAppVersion,
      capturedAt: this.now(),
    };
    await adapter.write(normalizePath(`${directory}/${BACKUP_METADATA_FILE}`), JSON.stringify(metadata));
    await this.pruneBackups();
  }

  private async readBackupPackage(id: string, expectedVersion: string): Promise<PluginPackage> {
    if (!/^[0-9]+-[0-9]+-[0-9A-Za-z._-]+$/u.test(id)) {
      throw new PackageValidationError('Invalid local backup identifier.');
    }
    const directory = normalizePath(`${this.backupRoot()}/${id}`);
    const files = await this.readPackageFiles(directory);
    const parsed = parseManifest(files['manifest.json'], expectedVersion);
    if (!this.isApiVersionSupported(parsed.minAppVersion)) {
      throw new PackageValidationError(`Backup ${expectedVersion} requires Obsidian ${parsed.minAppVersion} or later.`);
    }
    return { version: parsed.version, minAppVersion: parsed.minAppVersion, files };
  }

  private async refreshBackups(): Promise<void> {
    const root = this.backupRoot();
    const adapter = this.adapter();
    if (!(await adapter.exists(root))) {
      this.backups = new Map();
      return;
    }
    let listing: { folders: string[] };
    try {
      listing = await adapter.list(root);
    } catch {
      this.backups = new Map();
      return;
    }
    const backups = await Promise.all(listing.folders.map(async (directory) => {
      const id = directory.split('/').pop() ?? '';
      if (!/^[0-9]+-[0-9]+-[0-9A-Za-z._-]+$/u.test(id)) return null;
      const metadataPath = normalizePath(`${directory}/${BACKUP_METADATA_FILE}`);
      try {
        const metadata = this.parseBackupMetadata(await adapter.read(metadataPath));
        const files = await this.readPackageFiles(directory);
        const manifest = parseManifest(files['manifest.json'], metadata.version);
        const compatible = this.isApiVersionSupported(manifest.minAppVersion);
        return {
          kind: 'backup' as const,
          id,
          version: metadata.version,
          capturedAt: metadata.capturedAt,
          minAppVersion: manifest.minAppVersion,
          compatible,
          installable: compatible,
          unavailableReason: compatible ? null : `Requires Obsidian ${manifest.minAppVersion} or later.`,
        };
      } catch {
        return null;
      }
    }));
    const validBackups = backups.filter((backup): backup is NonNullable<typeof backup> => backup !== null);
    this.backups = new Map(validBackups.map((backup): [string, PluginUpdateBackup] => [backup.id, backup]));
  }

  private parseBackupMetadata(value: string): BackupMetadata {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new PackageValidationError('Backup metadata is not valid JSON.');
    }
    if (!isRecord(parsed)
      || parsed.schemaVersion !== 1
      || !readString(parsed.version)
      || !parseVersion(parsed.version as string)
      || !readString(parsed.minAppVersion)
      || typeof parsed.capturedAt !== 'number'
      || !Number.isFinite(parsed.capturedAt)) {
      throw new PackageValidationError('Backup metadata is invalid.');
    }
    return {
      schemaVersion: 1,
      version: parsed.version as string,
      minAppVersion: parsed.minAppVersion as string,
      capturedAt: parsed.capturedAt,
    };
  }

  private async pruneBackups(): Promise<void> {
    await this.refreshBackups();
    const ordered = [...this.backups.values()].sort((left, right) => right.capturedAt - left.capturedAt);
    const adapter = this.adapter();
    for (const backup of ordered.slice(MAX_BACKUPS)) {
      await adapter.rmdir(normalizePath(`${this.backupRoot()}/${backup.id}`), true);
      this.backups.delete(backup.id);
    }
  }

  private async ensureDirectory(directory: string): Promise<void> {
    const adapter = this.adapter();
    const parts = normalizePath(directory).split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await adapter.exists(current))) {
        await adapter.mkdir(current);
      }
    }
  }

  private async persist(): Promise<void> {
    await this.persistState?.({ ...this.persistedState });
  }
}
