import type { App } from 'obsidian';

export function getVaultBasePath(app: App): string | null {
  return (app.vault?.adapter as unknown as { basePath?: string } | undefined)?.basePath ?? null;
}
