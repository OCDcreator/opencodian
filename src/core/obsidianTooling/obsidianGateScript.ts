/**
 * Generator for the `obsidian-gate` wrapper script (R-B4).
 *
 * This is the MECHANISM behind the high-impact confirmation requirement: the
 * agent is told (via the injected capability block) to invoke the Obsidian CLI
 * through this wrapper, and the wrapper itself refuses to execute any
 * high-impact subcommand until the OpenCodian plugin has written an explicit
 * user decision into the plugin-owned requests directory. No decision means
 * no execution (fail closed), and a deny/timeout exits non-zero with a clear
 * message so the model can report the refusal truthfully.
 *
 * The generated artifact is POSIX sh (macOS/Linux this milestone) and is
 * written into `<vault>/.opencodian/obsidian-tooling/obsidian-gate` by the
 * coordinator whenever the tooling mode is applied; the plugin owns the file
 * and rewrites it when the catalog changes.
 *
 * Honest enforcement boundary (see docs/architecture/owners/core-obsidian-tooling.md):
 * the wrapper gates the SANCTIONED path. A model deliberately calling the raw
 * `obsidian` binary, or hand-crafting decision files (same-user filesystem),
 * is outside what a user-space script can prevent. The gate guarantees the
 * dialog appears by default and that nothing runs without a recorded decision
 * through the sanctioned path; it is not an anti-adversarial containment.
 */

import { buildGateScriptCommandSets } from './obsidianToolingCatalog';

export interface GateScriptInput {
  /** CLI command the wrapper execs (default `obsidian`). */
  readonly cliCommand?: string;
  /** Seconds the wrapper waits for a user decision. */
  readonly waitSeconds?: number;
}

function shSingleQuotedList(subcommands: readonly string[]): string {
  return subcommands.map((name) => `'${name}'`).join(' ');
}

/**
 * Build the gate script text. Pure and deterministic: the same input always
 * produces byte-identical output, so the coordinator can skip rewriting an
 * unchanged file.
 */
export function buildGateScript(input: GateScriptInput = {}): string {
  const cliCommand = input.cliCommand ?? 'obsidian';
  const waitSeconds = Math.max(5, Math.round(input.waitSeconds ?? 90));
  const { passthrough, highImpact } = buildGateScriptCommandSets();
  return `#!/bin/sh
# obsidian-gate — OpenCodian confirmation gate for the Obsidian desktop CLI (R-B4).
# GENERATED FILE: owned and rewritten by the OpenCodian plugin. Do not edit.
#
# Usage: obsidian-gate <subcommand> [args...]        (same argv as ${cliCommand})
#
# Contract:
#   - read / navigation / vault-write subcommands execute directly. Vault
#     writes surface as normal Obsidian vault events and appear in the
#     OpenCodian edit-revert sidebar.
#   - high-impact subcommands (themes, plugins, dev/eval, delete, reload...)
#     require an explicit user decision. This script writes
#     requests/<id>.request.json and waits (default ${waitSeconds}s) for
#     requests/<id>.decision.json written by the OpenCodian plugin after the
#     user answers the confirmation dialog. No decision => no execution.
#   - subcommands unknown to this generated version are treated as
#     high-impact (fail closed).
#
# Exit codes:
#   0  command executed (or gate approved)
#   2  usage / environment error (nothing executed)
#   3  user denied the request (nothing executed)
#   4  request timed out or expired (nothing executed)
#   5  unreadable decision file (nothing executed, fail closed)
#   propagates the underlying CLI exit code for approved executions.

set -eu

GATE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 2
REQUESTS_DIR="$GATE_DIR/requests"
CLI_BIN=\${OBSIDIAN_OPENCODIAN_CLI_BIN:-${cliCommand}}
WAIT_SECONDS=\${OBSIDIAN_OPENCODIAN_GATE_WAIT:-${waitSeconds}}

if [ "$#" -lt 1 ]; then
  printf 'obsidian-gate: usage: obsidian-gate <subcommand> [args...]\\n' >&2
  exit 2
fi

# The subcommand is the first argument that is neither a -flag nor a key=value
# global option (for example vault=<name>).
SUBCOMMAND=""
for arg in "$@"; do
  case "$arg" in
    -*) continue ;;
    *=*) continue ;;
    *) SUBCOMMAND="$arg"; break ;;
  esac
done
if [ -z "$SUBCOMMAND" ]; then
  printf 'obsidian-gate: no subcommand found in argv; refusing to execute\\n' >&2
  exit 2
fi

# --- classification ---------------------------------------------------------
# PASSTHROUGH: (${shSingleQuotedList(passthrough)})
# HIGH IMPACT: (${shSingleQuotedList(highImpact)})
IS_HIGH_IMPACT=0
case " ${highImpact.join(' ')} " in
  *" $SUBCOMMAND "*)
    IS_HIGH_IMPACT=1
    ;;
  *)
    case " ${passthrough.join(' ')} " in
      *" $SUBCOMMAND "*)
        IS_HIGH_IMPACT=0
        ;;
      *)
        # Unknown subcommand: fail closed through the confirmation gate.
        IS_HIGH_IMPACT=1
        ;;
    esac
    ;;
esac

if [ "$IS_HIGH_IMPACT" -eq 0 ]; then
  exec "$CLI_BIN" "$@"
fi

# --- confirmation handshake --------------------------------------------------
mkdir -p "$REQUESTS_DIR" || {
  printf 'obsidian-gate: cannot create requests directory; refusing to run %s\\n' "$SUBCOMMAND" >&2
  exit 2
}

REQ_ID="req-$(date +%s)-$$-$RANDOM"
REQ_TMP="$REQUESTS_DIR/$REQ_ID.request.json.tmp"
REQ_FILE="$REQUESTS_DIR/$REQ_ID.request.json"
DECISION_FILE="$REQUESTS_DIR/$REQ_ID.decision.json"

json_escape() {
  printf '%s' "$1" | sed -e 's/\\\\/\\\\\\\\/g' -e 's/"/\\\\"/g'
}

ARGS_JSON=""
for arg in "$@"; do
  if [ -z "$ARGS_JSON" ]; then
    ARGS_JSON="\\"$(json_escape "$arg")\\""
  else
    ARGS_JSON="$ARGS_JSON,\\"$(json_escape "$arg")\\""
  fi
done

NOW=$(date +%s)
cat > "$REQ_TMP" <<EOF
{"id":"$REQ_ID","subcommand":"$(json_escape "$SUBCOMMAND")","argv":[$ARGS_JSON],"requestedAt":$NOW,"waitSeconds":$WAIT_SECONDS,"gateDir":"$(json_escape "$GATE_DIR")"}
EOF
mv -f "$REQ_TMP" "$REQ_FILE"

printf 'obsidian-gate: high-impact command %s requires user confirmation; waiting up to %ss for a decision in the OpenCodian plugin...\\n' "$SUBCOMMAND" "$WAIT_SECONDS" >&2

ELAPSED=0
while [ "$ELAPSED" -lt "$WAIT_SECONDS" ]; do
  if [ -f "$DECISION_FILE" ]; then
    DECISION=$(sed -n 's/.*"decision":"\\([a-z]*\\)".*/\\1/p' "$DECISION_FILE" 2>/dev/null | head -n 1)
    case "$DECISION" in
      allow)
        # Exec with the EXACT original argv the user approved.
        exec "$CLI_BIN" "$@"
        ;;
      deny)
        printf 'obsidian-gate: user DENIED %s. Nothing was executed. Report this to the user and do not retry.\\n' "$SUBCOMMAND" >&2
        exit 3
        ;;
      expired)
        printf 'obsidian-gate: request for %s expired before a user decision. Nothing was executed.\\n' "$SUBCOMMAND" >&2
        exit 4
        ;;
      *)
        printf 'obsidian-gate: unreadable decision file for %s; refusing to execute (fail closed).\\n' "$SUBCOMMAND" >&2
        exit 5
        ;;
    esac
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

printf 'obsidian-gate: timed out after %ss waiting for a user decision on %s. Nothing was executed. Ask the user to approve the pending request in the OpenCodian plugin.\\n' "$WAIT_SECONDS" "$SUBCOMMAND" >&2
exit 4
`;
}
