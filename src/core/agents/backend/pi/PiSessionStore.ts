import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { piRecord } from './PiRpcClient';

export interface PiSessionInfo {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sessionFile?: string;
}

/** Plugin-owned handles/metadata only; pi owns the JSONL session format and history. */
export class PiSessionStore {
  constructor(readonly directory: string) {}

  sessionPath(id: string): string {
    if (!/^pi-[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid Pi session id.');
    return path.join(this.directory, `${id}.jsonl`);
  }

  async create(title = 'New Pi chat'): Promise<PiSessionInfo> {
    const info = { id: `pi-${randomUUID()}`, title, createdAt: Date.now(), updatedAt: Date.now() };
    await this.save(info);
    return info;
  }

  async get(id: string): Promise<PiSessionInfo | null> {
    const file = `${this.sessionPath(id)}.meta.json`;
    try {
      const value = piRecord(JSON.parse(await fs.readFile(file, 'utf8')));
      if (value.id !== id || typeof value.title !== 'string' || typeof value.createdAt !== 'number' || typeof value.updatedAt !== 'number') {
        throw new Error('Invalid Pi session metadata.');
      }
      return value as unknown as PiSessionInfo;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async list(): Promise<PiSessionInfo[]> {
    await fs.mkdir(this.directory, { recursive: true });
    const entries = await fs.readdir(this.directory);
    const result: PiSessionInfo[] = [];
    for (const entry of entries.filter((name) => /^pi-[0-9a-f-]{36}\.jsonl\.meta\.json$/.test(name))) {
      const info = await this.get(entry.slice(0, -'.jsonl.meta.json'.length));
      if (info) result.push(info);
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async save(info: PiSessionInfo): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const file = `${this.sessionPath(info.id)}.meta.json`;
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(info), { mode: 0o600 });
      await fs.rename(temporary, file);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async remove(id: string): Promise<void> {
    const info = await this.get(id);
    const file = info?.sessionFile ? this.validateNativePath(info.sessionFile) : this.sessionPath(id);
    await fs.rm(file, { force: true });
    await fs.rm(`${this.sessionPath(id)}.meta.json`, { force: true });
  }

  validateNativePath(file: string): string {
    const resolved = path.resolve(file);
    if (path.dirname(resolved) !== path.resolve(this.directory) || path.extname(resolved) !== '.jsonl') throw new Error('Pi session file is outside its storage directory.');
    return resolved;
  }

  async adoptNative(file: string, title: string): Promise<PiSessionInfo> {
    const sessionFile = this.validateNativePath(file);
    const info = await this.create(title);
    const result = { ...info, sessionFile };
    await this.save(result);
    return result;
  }

  async importClone(source: string, title: string): Promise<PiSessionInfo> {
    const resolved = await fs.realpath(source);
    const root = await fs.realpath(this.directory);
    if (path.dirname(resolved) !== root || path.extname(resolved) !== '.jsonl') throw new Error('Pi clone is outside the session directory.');
    const info = await this.create(title);
    try {
      await fs.copyFile(resolved, this.sessionPath(info.id));
      await fs.rm(resolved);
      return info;
    } catch (error) {
      await this.remove(info.id);
      throw error;
    }
  }
}
