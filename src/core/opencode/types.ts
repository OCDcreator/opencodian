/**
 * OpenCode SDK wrapper types
 */

import type { StreamChunk } from '../types';

/** Response handler callbacks */
export interface ResponseHandler {
  id: string;
  onChunk: (chunk: StreamChunk) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

/** Server status */
export type ServerStatus = 
  | 'stopped'
  | 'starting'
  | 'running'
  | 'error'
  | 'restarting';

/** Server error */
export interface ServerError {
  code: string;
  message: string;
  recoverable: boolean;
}

/** Query options */
export interface QueryOptions {
  model?: string;
  provider?: string;
  allowedTools?: string[];
  externalContextPaths?: string[];
}

/** Server configuration */
export interface OpenCodeServerConfig {
  host: string;
  port: number;
  timeout?: number;
}

/** Client configuration */
export interface OpenCodeClientConfig {
  baseUrl: string;
  fetch?: typeof fetch;
}
