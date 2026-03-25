import type { App, Component } from 'obsidian';

export interface MarkdownRendererOptions {
  app: App;
  component: Component;
  container: HTMLElement;
  mediaFolder?: string;
  onFileLinkClick?: (linkTarget: string, event: MouseEvent) => void;
}

export interface ImageEmbedOptions {
  app: App;
  mediaFolder?: string;
}

export interface FileLinkOptions {
  app: App;
  container: HTMLElement;
  component: Component;
  onClick?: (linkTarget: string, event: MouseEvent) => void;
}

export interface CodeBlockOptions {
  addLanguageLabel?: boolean;
  addCopyButton?: boolean;
  wrapperClass?: string;
  languageLabelClass?: string;
}

export interface RenderResult {
  success: boolean;
  error?: string;
}
