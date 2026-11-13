/**
 * OpenCode JS SDK v2 type bridge.
 *
 * Source of truth (official upstream, pinned to the plugin's `@opencode-ai/sdk`
 * 1.19.5 tag on the legacy `v1` branch):
 * - https://github.com/anomalyco/opencode/blob/v1.19.5/packages/sdk/js/src/v2
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
