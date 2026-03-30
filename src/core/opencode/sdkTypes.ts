/**
 * OpenCode JS SDK v2 type bridge.
 *
 * Source of truth:
 * - `reference-projects/opencode/packages/sdk/js/src/v2`
 */

import type {
  AgentPartInput,
  Event,
  FilePartInput,
  Message,
  OpencodeClient,
  OpencodeClientConfig,
  OutputFormat,
  Part,
  PermissionRequest,
  Session,
  SubtaskPartInput,
  TextPartInput,
} from '@opencode-ai/sdk/v2/client';

export type {
  AgentPartInput as SdkAgentPartInput,
  Event as SdkEvent,
  FilePartInput as SdkFilePartInput,
  Message as SdkMessage,
  OpencodeClientConfig as SdkOpencodeClientConfig,
  OutputFormat as SdkOutputFormat,
  Part as SdkPart,
  PermissionRequest as SdkPermissionRequest,
  Session as SdkSession,
  SubtaskPartInput as SdkSubtaskPartInput,
  TextPartInput as SdkTextPartInput,
};

export type SdkSyncEventStream = {
  stream: AsyncIterable<unknown>;
};

export type SdkOpencodeClient = OpencodeClient;
