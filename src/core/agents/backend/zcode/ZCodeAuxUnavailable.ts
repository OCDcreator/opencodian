/**
 * ZCodeAuxUnavailable — retained legacy wording for the pre-audit state.
 *
 * The aux contract (AgentAuxQueryCapability) requires *runtime-verified*
 * read-only execution; a prompt instruction is never accepted evidence. The
 * official ZCode protocol has a restriction path now implemented by
 * ZCodeAuxQuerySession. This unused module records the former verdict:
 *
 * - `session/create`/`session/resume` accept tool allow/deny lists and the
 *   official runtime filters its tool registry. `plan` is not a safety
 *   boundary and its readback is deliberately not used as one.
 * - Native `session/messages[].info.tools` can read back the stored effective
 *   tool set after a verification turn. It must be checked against an empty
 *   list for the current native user message,
 *   never inferred from the request fields.
 * - A successful generic implementation needs a second app-server with a
 *   plugin-owned temporary `ZCODE_STORAGE_DIR`, existing read-only provider
 *   config references, native image attachments, vault/config snapshots, and
 *   exit-confirmed cleanup of that exact owned root.
 *
 * The active adapter now uses a private scope and completed a real image,
 * follow-up, hostile-write, cancellation, and cleanup audit. It does not
 * import this legacy error factory.
 */

/** Historical detail only; active runtime diagnostics do not use it. */
export const ZCODE_AUX_UNAVAILABLE_REASON =
  'Historical ZCode auxiliary unavailable verdict; the active adapter uses an isolated audited session.';

/** Build the rejection error for generic auxiliary-session starts. */
export function createZCodeAuxUnavailableError(): Error {
  return new Error(ZCODE_AUX_UNAVAILABLE_REASON);
}
