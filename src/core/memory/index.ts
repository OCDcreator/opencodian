/**
 * Barrel for the backend-neutral memory core (`core.memory` owner).
 *
 * Hard invariant: nothing exported from here imports an agent backend, the
 * OpenCode service, or any feature/app module. All infrastructure contact
 * flows through the injected `MemoryFileSystem` / `MemoryModelInvoker`
 * ports, bound by `app.memory-runtime`.
 */

export * from './MemoryBackendService';
export * from './memoryExtraction';
export * from './memoryFileSystem';
export * from './memoryHygiene';
export * from './memoryIndexFormat';
export * from './memoryInjection';
export * from './memoryMaintenance';
export * from './memoryManifest';
export * from './memoryPaths';
export * from './memoryProtocol';
export * from './memoryRecall';
export * from './memoryReflection';
export * from './memorySecretScan';
export * from './memoryStore';
export * from './memoryTypes';
