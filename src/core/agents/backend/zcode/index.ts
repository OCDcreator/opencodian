/**
 * ZCode backend package — the isolated adapter/transport boundary for the
 * official ZCode runtime's `app-server --stdio` structured protocol.
 *
 * Runtime state never leaks into the generic chat view: everything below
 * owns its own child process and native session lifecycle.
 */

export {
  ZCodeAdapter,
  type ZCodeAdapterOptions,
  type ZCodeAdapterRuntimeDiagnostics,
  type ZCodeHandshakeState,
} from './ZCodeAdapter';
export {
  ZCodeAppServerTransport,
  type ZCodeAppServerTransportOptions,
  ZCodeRemoteRequestError,
  ZCodeTransportError,
} from './ZCodeAppServerTransport';
export {
  parseZCodeInboundMessage,
  parseZCodeRuntimeCapabilities,
  serializeZCodeRequest,
  serializeZCodeServerRequestReply,
  type ZCodeInboundMessage,
  type ZCodeProtocolError,
  ZCodeProtocolErrorCode,
  type ZCodeRuntimeCapabilities,
} from './ZCodeProtocolTypes';
export {
  discoverZCodeProviderConfig,
  resolveZCodeDataRoot,
  type ZCodeProviderConfigDiscoveryOptions,
  type ZCodeProviderConfigSnapshot,
  type ZCodeProviderConfigState,
} from './ZCodeProviderConfigDiscovery';
export {
  getZCodeRuntimeErrorMessage,
  resolveZCodeRuntime,
  type ZCodeRuntimeEntryKind,
  type ZCodeRuntimeLaunch,
  type ZCodeRuntimeResolution,
  type ZCodeRuntimeResolverOptions,
  type ZCodeRuntimeSource,
} from './ZCodeRuntimeResolver';
