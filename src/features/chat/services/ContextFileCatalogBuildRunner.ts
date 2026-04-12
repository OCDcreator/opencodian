import { TFile } from 'obsidian';

import { ContextFileCatalogIndex } from './ContextFileCatalogIndex';

export interface ContextFileCatalogBuildRunnerOptions {
  batchSize?: number;
  yieldControl?: () => Promise<void>;
}

const DEFAULT_BATCH_SIZE = 400;

export class ContextFileCatalogBuildRunner {
  private readonly batchSize: number;
  private readonly yieldControl: () => Promise<void>;

  constructor(options: ContextFileCatalogBuildRunnerOptions = {}) {
    const requestedBatchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.batchSize = requestedBatchSize > 0
      ? Math.floor(requestedBatchSize)
      : DEFAULT_BATCH_SIZE;
    this.yieldControl = options.yieldControl ?? yieldContextFileCatalogBuild;
  }

  async buildIndex(files: readonly TFile[]): Promise<ContextFileCatalogIndex> {
    const catalogIndex = new ContextFileCatalogIndex();

    for (let index = 0; index < files.length; index += this.batchSize) {
      const batch = files.slice(index, index + this.batchSize);
      for (const file of batch) {
        catalogIndex.appendBuildFile(file);
      }

      if (index + this.batchSize < files.length) {
        await this.yieldControl();
      }
    }

    catalogIndex.finalizeBuild();
    return catalogIndex;
  }
}

async function yieldContextFileCatalogBuild(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
