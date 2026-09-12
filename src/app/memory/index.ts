/**
 * Barrel for the memory runtime composition layer (`app.memory-runtime`
 * owner). Exposes the coordinator and its vault filesystem adapter; `main.ts`
 * is the only constructor caller.
 */

export {
  MemoryRuntimeCoordinator,
  type MemoryRuntimeCoordinatorOptions,
  VaultMemoryFileSystem,
} from './MemoryRuntimeCoordinator';
