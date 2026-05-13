import * as fs from 'fs';
import { normalizePath } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import type { OpenCodianPlugin } from '../../main';
import type { ToolFileInfo, VaultAdapterLike } from './SettingsToolDetailModal';

const PROJECT_TOOLS_DIR = '.opencode/tools';
const TOOL_FILE_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs']);

export class SettingsToolFileService {
  constructor(private readonly plugin: OpenCodianPlugin) {}

  async getCustomToolFiles(): Promise<ToolFileInfo[]> {
    const [projectFiles, globalFiles] = await Promise.all([
      this.getProjectToolFiles(),
      this.getGlobalToolFiles(),
    ]);
    return [...projectFiles, ...globalFiles].sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === 'project' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  async createProjectTool(): Promise<string> {
    const toolName = await this.getNextProjectToolName();
    const targetPath = `${PROJECT_TOOLS_DIR}/${toolName}.ts`;
    await this.ensureParentDir(targetPath);
    await this.getVaultAdapter().write?.(targetPath, this.createToolTemplate(toolName));
    return targetPath;
  }

  async deleteProjectTool(file: ToolFileInfo): Promise<void> {
    await this.getVaultAdapter().remove?.(file.path);
  }

  async readToolFileContent(file: ToolFileInfo): Promise<string> {
    if (file.source === 'project') {
      return await this.getVaultAdapter().read?.(file.path) ?? '';
    }
    return await fs.promises.readFile(file.path, 'utf-8');
  }

  private async getProjectToolFiles(): Promise<ToolFileInfo[]> {
    const adapter = this.getVaultAdapter();
    if (!adapter.list) {
      return [];
    }
    const files = await this.listVaultToolFiles(PROJECT_TOOLS_DIR);
    return files.map((filePath) => ({
      name: this.getToolNameFromPath(filePath),
      path: filePath,
      source: 'project',
    }));
  }

  private async listVaultToolFiles(directory: string): Promise<string[]> {
    const adapter = this.getVaultAdapter();
    try {
      if (adapter.exists && !(await adapter.exists(directory))) {
        return [];
      }
      const listing = await adapter.list?.(directory);
      if (!listing) {
        return [];
      }
      const files = listing.files.filter((filePath) => this.isToolFile(filePath));
      const nested = await Promise.all(listing.folders.map((folderPath) => this.listVaultToolFiles(folderPath)));
      return [...files, ...nested.flat()];
    } catch {
      return [];
    }
  }

  private async getGlobalToolFiles(): Promise<ToolFileInfo[]> {
    const globalDir = path.join(os.homedir(), '.config', 'opencode', 'tools');
    try {
      const entries = await fs.promises.readdir(globalDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && this.isToolFile(entry.name))
        .map((entry) => {
          const filePath = path.join(globalDir, entry.name);
          return {
            name: this.getToolNameFromPath(entry.name),
            path: filePath,
            source: 'global' as const,
          };
        });
    } catch {
      return [];
    }
  }

  private async getNextProjectToolName(): Promise<string> {
    const adapter = this.getVaultAdapter();
    for (let index = 0; index < 100; index += 1) {
      const suffix = index === 0 ? '' : `-${index + 1}`;
      const candidate = `new-tool${suffix}`;
      const candidatePath = `${PROJECT_TOOLS_DIR}/${candidate}.ts`;
      if (!adapter.exists || !(await adapter.exists(candidatePath))) {
        return candidate;
      }
    }
    return `new-tool-${Date.now()}`;
  }

  private createToolTemplate(toolName: string): string {
    return `import { tool } from "@opencode-ai/plugin";\n\nexport default tool({\n  description: "Describe what ${toolName} does.",\n  args: {},\n  async execute() {\n    return "Implement ${toolName}";\n  },\n});\n`;
  }

  private async ensureParentDir(filePath: string): Promise<void> {
    const adapter = this.getVaultAdapter();
    const segments = normalizePath(filePath).split('/');
    segments.pop();
    let currentPath = '';
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (!adapter.exists || !(await adapter.exists(currentPath))) {
        await adapter.mkdir?.(currentPath);
      }
    }
  }

  private getVaultAdapter(): VaultAdapterLike {
    return (this.plugin.app?.vault?.adapter ?? {}) as VaultAdapterLike;
  }

  private getToolNameFromPath(filePath: string): string {
    return path.basename(filePath, path.extname(filePath));
  }

  private isToolFile(filePath: string): boolean {
    return TOOL_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }
}
