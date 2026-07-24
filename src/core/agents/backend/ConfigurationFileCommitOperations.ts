/**
 * Narrow filesystem syscall boundary for configuration-file commit operations.
 *
 * This owner deliberately contains no path, revision, archive, or policy
 * logic. `ProjectResourceSecureWrite` owns those security decisions; this
 * module only gives its final rename/link/unlink syscalls one testable seam.
 */
import { link, rename, unlink } from 'fs/promises';

/** Replace a prepared same-directory temporary file at the final commit boundary. */
export async function renameFileAtCommit(sourcePath: string, targetPath: string): Promise<void> {
  await rename(sourcePath, targetPath);
}

/** Atomically publish a prepared file only when the target is still absent. */
export async function linkFileAtCommit(sourcePath: string, targetPath: string): Promise<void> {
  await link(sourcePath, targetPath);
}

/** Remove the target at the final delete commit boundary. */
export async function unlinkFileAtCommit(targetPath: string): Promise<void> {
  await unlink(targetPath);
}
