/**
 * Barrel for the memory runtime composition layer (`app.memory-runtime`
 * owner). Exposes the coordinator and its filesystem adapters (vault-local
 * and external shared-store); `main.ts` is the only constructor caller.
 */

export {
  expandHomeDir,
  ExternalMemoryFileSystem,
} from './ExternalMemoryFileSystem';
export {
  checkMemorySyncTreeRoot,
  ensureMemorySyncRepo,
  MEMORY_SYNC_LOCK_FILENAME,
  MemoryGitSyncService,
  type MemorySyncResult,
  syncMemoryTree,
} from './MemoryGitSyncService';
export {
  MemoryRuntimeCoordinator,
  type MemoryRuntimeCoordinatorOptions,
  VaultMemoryFileSystem,
} from './MemoryRuntimeCoordinator';
