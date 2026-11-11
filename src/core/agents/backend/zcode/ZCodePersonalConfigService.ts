/** Revision-guarded edits to the same personal API configuration used by ZCode.
 * Account credentials and built-in provider definitions are never written here. */
import { randomUUID } from 'node:crypto';
import { chmod, mkdir } from 'node:fs/promises';
import * as path from 'node:path';

import {
  type ArchiveHistoryEntryIdentity,
  type ArchiveHistoryEntrySummary,
  type ConfigurationAllowlist,
  type ConfigurationArchiveOptions,
  type FileRevision,
  listConfigurationArchiveHistory,
  type SafeFileMutationResult,
  safeRestoreArchivedEntry,
  safeWriteFile,
} from '../configuration/ProjectResourceSecureWrite';
import { readZCodeJson, withZCodeFileLock, zcodeRecord } from './ZCodeNativeStore';

export const ZCODE_API_PROTOCOLS = ['openai-chat-completions', 'openai-responses', 'anthropic-messages'] as const;
export interface ZCodePersonalProvider {
  readonly id: string;
  readonly name: string;
  readonly protocol: string;
  readonly baseUrl: string;
  readonly hasApiKey: boolean;
  readonly models: readonly string[];
  readonly editable: boolean;
}
export interface ZCodePersonalConfigSnapshot {
  readonly path: string;
  readonly revision: FileRevision | null;
  readonly providers: readonly ZCodePersonalProvider[];
}
export interface ZCodeProviderDraft {
  readonly id?: string;
  readonly name: string;
  readonly protocol: (typeof ZCODE_API_PROTOCOLS)[number];
  readonly baseUrl: string;
  /** Undefined leaves the native secret untouched. Empty is an explicit clear. */
  readonly apiKey?: string;
  readonly models: readonly string[];
}

function providerRules(document: Record<string, unknown>): unknown[] {
  const config = zcodeRecord(document.config);
  const rules = zcodeRecord(config.providerConfigRules).providerRules;
  if (document.schemaVersion !== 1 || !Array.isArray(rules)
    || !Array.isArray(zcodeRecord(config.modelConfigRules).providerModelRules)
    || !Array.isArray(zcodeRecord(config.modelConfigRules).manualProviderModelRules)) throw new Error('zcode-config-version-unsupported');
  return rules;
}

function emptyDocument(): Record<string, unknown> {
  return { schemaVersion: 1, config: { providerConfigRules: { providerRules: [] }, modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] } } };
}

function editableProvider(rule: Record<string, unknown>): boolean {
  const config = zcodeRecord(rule.config);
  return typeof rule.providerId === 'string' && !rule.providerId.startsWith('account:')
    && config.group === 'standard-personal' && zcodeRecord(config.access).type === 'api-key'
    && ZCODE_API_PROTOCOLS.includes(zcodeRecord(config.api).type as ZCodeProviderDraft['protocol']);
}

export class ZCodePersonalConfigService {
  constructor(readonly targetPath: string, private readonly archiveRootPath?: string) {}

  async read(): Promise<ZCodePersonalConfigSnapshot> {
    const snapshot = await readZCodeJson(this.targetPath);
    const rules = providerRules(snapshot.revision ? snapshot.document : emptyDocument());
    const providers = rules.map((raw): ZCodePersonalProvider => {
      const rule = zcodeRecord(raw), config = zcodeRecord(rule.config), api = zcodeRecord(config.api);
      return {
        id: typeof rule.providerId === 'string' ? rule.providerId : '',
        name: typeof rule.providerName === 'string' ? rule.providerName : String(rule.providerId ?? ''),
        protocol: typeof api.type === 'string' ? api.type : '',
        baseUrl: typeof api.baseUrl === 'string' ? api.baseUrl : '',
        hasApiKey: typeof zcodeRecord(config.access).apiKey === 'string' && !!zcodeRecord(config.access).apiKey,
        models: Array.isArray(config.personalModelIds) ? config.personalModelIds.filter((value): value is string => typeof value === 'string') : [],
        editable: editableProvider(rule),
      };
    });
    return { path: this.targetPath, revision: snapshot.revision, providers };
  }

  async save(draft: ZCodeProviderDraft, expectedRevision: FileRevision | null): Promise<SafeFileMutationResult> {
    let url: URL;
    try { url = new URL(draft.baseUrl.trim()); } catch { throw new Error('zcode-provider-url-invalid'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('zcode-provider-url-invalid');
    if (!draft.name.trim() || !ZCODE_API_PROTOCOLS.includes(draft.protocol)) throw new Error('zcode-provider-fields-required');
    const models = [...new Set(draft.models.map((value) => value.trim()).filter(Boolean))];
    if (!models.length || models.some((value) => /\s/.test(value))) throw new Error('zcode-provider-model-required');
    return this.mutate(expectedRevision, (document, rules) => {
      const index = draft.id ? rules.findIndex((raw) => zcodeRecord(raw).providerId === draft.id) : -1;
      if (draft.id && index < 0) throw new Error('zcode-provider-not-found');
      const previous = index < 0 ? {} : zcodeRecord(rules[index]);
      if (index >= 0 && !editableProvider(previous)) throw new Error('zcode-provider-read-only');
      const config = zcodeRecord(previous.config), access = zcodeRecord(config.access);
      const id = draft.id ?? `custom-${randomUUID()}`;
      const key = draft.apiKey === undefined ? access.apiKey : draft.apiKey.trim();
      if (typeof key !== 'string' || !key.trim()) throw new Error('zcode-provider-key-required');
      const next = { ...previous, providerId: id, providerName: draft.name.trim(), config: {
        ...config, group: 'standard-personal', access: { ...access, type: 'api-key', apiKey: key },
        api: { ...zcodeRecord(config.api), type: draft.protocol, baseUrl: draft.baseUrl.trim() }, personalModelIds: models,
      } };
      if (index < 0) rules.push(next); else rules[index] = next;
      this.removeDeletedModelReferences(document, id, models);
    });
  }

  async remove(id: string, expectedRevision: FileRevision | null): Promise<SafeFileMutationResult> {
    return this.mutate(expectedRevision, (document, rules) => {
      const index = rules.findIndex((raw) => zcodeRecord(raw).providerId === id);
      if (index < 0) throw new Error('zcode-provider-not-found');
      if (!editableProvider(zcodeRecord(rules[index]))) throw new Error('zcode-provider-read-only');
      rules.splice(index, 1);
      this.removeDeletedModelReferences(document, id, []);
      const config = zcodeRecord(document.config);
      if (Array.isArray(config.providerOrder)) config.providerOrder = config.providerOrder.filter((value) => value !== id);
    });
  }

  /**
   * Validated archive history for this personal configuration target.
   * Returns `null` when the target is outside this service's allowlist (the
   * caller must never see another path's history). Archive failures throw so
   * a broken manifest surfaces instead of masquerading as "no history".
   */
  async listPersonalConfigHistory(): Promise<readonly ArchiveHistoryEntrySummary[] | null> {
    const result = await listConfigurationArchiveHistory({
      targetPath: this.targetPath,
      allowlist: this.allowlist(),
      archive: this.archiveOptions(),
    });
    if (result.status === 'invalid-path') return null;
    if (result.status === 'archive-failed') throw new Error(`zcode-archive-history-unavailable: ${result.cause}`);
    return result.targets[0]?.entries ?? [];
  }

  /**
   * Restore one caller-selected archive entry through the canonical secure
   * restore path (identity validation, allowlist re-check, revision conflict
   * gate, archive-before-replace, shared mutation lock). No ad-hoc writes.
   */
  restorePersonalConfigEntry(entryIdentity: ArchiveHistoryEntryIdentity, expectedRevision: FileRevision | null): Promise<SafeFileMutationResult> {
    return safeRestoreArchivedEntry({
      entryIdentity,
      expectedRevision,
      allowlist: this.allowlist(),
      ...(this.archiveRootPath ? { archiveRootPath: this.archiveRootPath } : {}),
    });
  }

  private allowlist(): ConfigurationAllowlist {
    return [{ scope: 'global', rootPath: path.dirname(this.targetPath) }];
  }

  private archiveOptions(): ConfigurationArchiveOptions {
    return {
      backend: 'zcode',
      kind: 'personal-providers',
      format: 'json',
      ...(this.archiveRootPath ? { archiveRootPath: this.archiveRootPath } : {}),
    };
  }

  private removeDeletedModelReferences(document: Record<string, unknown>, id: string, models: readonly string[]): void {
    const config = zcodeRecord(document.config), modelRules = zcodeRecord(config.modelConfigRules);
    for (const key of ['providerModelRules', 'manualProviderModelRules']) {
      if (Array.isArray(modelRules[key])) modelRules[key] = (modelRules[key] as unknown[]).filter((raw) => {
        const rule = zcodeRecord(raw);
        return rule.providerId !== id || models.includes(String(rule.modelId));
      });
    }
    const selected = zcodeRecord(config.defaultModelSelection);
    if (selected.providerId === id && !models.includes(String(selected.modelId))) delete config.defaultModelSelection;
  }

  private async mutate(expected: FileRevision | null, update: (document: Record<string, unknown>, rules: unknown[]) => void): Promise<SafeFileMutationResult> {
    await mkdir(path.dirname(this.targetPath), { recursive: true, mode: 0o700 });
    if (this.archiveRootPath) await mkdir(this.archiveRootPath, { recursive: true, mode: 0o700 });
    return withZCodeFileLock(this.targetPath, async () => {
      const snapshot = await readZCodeJson(this.targetPath);
      if ((expected === null) !== (snapshot.revision === null)
        || (expected && snapshot.revision && (expected.canonicalPath !== snapshot.revision.canonicalPath
          || expected.mtimeMs !== snapshot.revision.mtimeMs || expected.size !== snapshot.revision.size || expected.sha256 !== snapshot.revision.sha256))) {
        return { status: 'conflict', expected, current: snapshot.revision };
      }
      const document = snapshot.revision ? snapshot.document : emptyDocument();
      const rules = providerRules(document);
      update(document, rules);
      const result = await safeWriteFile({
        targetPath: this.targetPath, content: JSON.stringify(document, null, 2) + '\n', expectedRevision: expected,
        allowlist: this.allowlist(), format: 'json',
        archive: this.archiveOptions(),
      });
      if (result.status === 'success' && process.platform !== 'win32') await chmod(this.targetPath, 0o600);
      return result;
    });
  }
}
