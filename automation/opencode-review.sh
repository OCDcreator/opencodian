#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash automation/opencode-review.sh plan <phase-doc> <seed-plan> <roadmap> <ref-doc-1> <ref-doc-2>
  bash automation/opencode-review.sh code <roadmap> <phase-doc> <seed-plan>
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 2
fi

mode="$1"
shift

case "$mode" in
  plan) command_name="autopilot-plan-review" ;;
  code) command_name="autopilot-code-review" ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if ! command -v opencode >/dev/null 2>&1; then
  echo "[review] opencode CLI not found in PATH" >&2
  exit 2
fi

log_dir="automation/runtime/opencode-reviews"
mkdir -p "$log_dir"
timestamp="$(date '+%Y%m%d-%H%M%S')"
log_path="$log_dir/${timestamp}-${mode}.txt"

echo "[review] mode: $mode"
echo "[review] command: $command_name"
echo "[review] log: $log_path"

opencode run --dangerously-skip-permissions --command "$command_name" "$@" | tee "$log_path"

if rg -q '^VERDICT:[[:space:]]*PASS[[:space:]]*$' "$log_path"; then
  echo "[review] verdict: PASS"
  exit 0
fi

if rg -q '^VERDICT:[[:space:]]*FAIL[[:space:]]*$' "$log_path"; then
  echo "[review] verdict: FAIL"
  exit 1
fi

echo "[review] verdict missing from $log_path" >&2
exit 2
