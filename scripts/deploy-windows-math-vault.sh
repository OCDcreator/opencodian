#!/usr/bin/env bash

# Build OpenCodian, deploy the official three-file plugin bundle to the Windows
# math vault, then verify the remote main.js byte-for-byte.
set -euo pipefail

readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly remote_target="${OPENCODIAN_WINDOWS_SSH_TARGET:-lt@desktop-gs1a9np}"
readonly ssh_key="${OPENCODIAN_WINDOWS_SSH_KEY:-$HOME/.ssh/id_ed25519}"
readonly remote_plugin_dir="${OPENCODIAN_WINDOWS_PLUGIN_DIR:-C:/Users/lt/Desktop/Write/math/.obsidian/plugins/opencodian}"
readonly artifacts=(main.js manifest.json styles.css)

cd "$repo_root"

if [[ ! -r "$ssh_key" ]]; then
  printf 'SSH key is not readable: %s\n' "$ssh_key" >&2
  exit 2
fi

run_remote_powershell() {
  local powershell_script="$1"
  local encoded_script
  encoded_script="$(printf '%s' "$powershell_script" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')"
  ssh \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o IdentitiesOnly=yes \
    -o IdentityAgent=none \
    -i "$ssh_key" \
    "$remote_target" \
    "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded_script"
}

escape_powershell_single_quote() {
  printf '%s' "$1" | sed "s/'/''/g"
}

readonly escaped_remote_plugin_dir="$(escape_powershell_single_quote "$remote_plugin_dir")"

printf 'Building OpenCodian...\n'
npm run build

for artifact in "${artifacts[@]}"; do
  if [[ ! -f "dist/$artifact" ]]; then
    printf 'Missing build artifact: dist/%s\n' "$artifact" >&2
    exit 2
  fi
done

run_remote_powershell "\
\$pluginDir = '$escaped_remote_plugin_dir'
if (-not (Test-Path -LiteralPath \$pluginDir -PathType Container)) {
  throw \"Missing target plugin directory: \$pluginDir\"
}
Write-Output \"Target ready: \$pluginDir\"
"

printf 'Uploading plugin bundle to %s...\n' "$remote_plugin_dir"
for artifact in "${artifacts[@]}"; do
  scp \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o IdentitiesOnly=yes \
    -o IdentityAgent=none \
    -i "$ssh_key" \
    "dist/$artifact" \
    "${remote_target}:${remote_plugin_dir}/${artifact}"
done

local_main_hash="$(shasum -a 256 dist/main.js | cut -d ' ' -f 1 | tr '[:upper:]' '[:lower:]')"
build_id="$(rg -o -m 1 'BUILD_ID=\$\{"[A-Za-z0-9._-]+"\}' dist/main.js | sed -E 's/^BUILD_ID=\$\{"|"\}$//g')"
if [[ -z "$build_id" ]]; then
  printf 'Could not read BUILD_ID from dist/main.js\n' >&2
  exit 2
fi

readonly escaped_build_id="$(escape_powershell_single_quote "$build_id")"
readonly escaped_main_hash="$(escape_powershell_single_quote "$local_main_hash")"

run_remote_powershell "\
\$pluginDir = '$escaped_remote_plugin_dir'
\$expectedMainHash = '$escaped_main_hash'
\$expectedBuildId = '$escaped_build_id'
\$mainPath = Join-Path \$pluginDir 'main.js'
\$actualMainHash = (Get-FileHash -LiteralPath \$mainPath -Algorithm SHA256).Hash.ToLowerInvariant()
if (\$actualMainHash -ne \$expectedMainHash) {
  throw \"main.js SHA-256 mismatch: expected \$expectedMainHash, got \$actualMainHash\"
}
if (-not (Select-String -LiteralPath \$mainPath -SimpleMatch \$expectedBuildId -Quiet)) {
  throw \"main.js does not contain BUILD_ID \$expectedBuildId\"
}
Get-ChildItem -LiteralPath \$pluginDir -File |
  Where-Object { \$_.Name -in @('main.js', 'manifest.json', 'styles.css') } |
  ForEach-Object {
    \$fileHash = (Get-FileHash -LiteralPath \$_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output ('Verified ' + \$_.Name + ' SHA256=' + \$fileHash)
  }
Write-Output \"Verified BUILD_ID=\$expectedBuildId\"
"

printf 'Deployment complete. Reload OpenCodian or restart Obsidian on Windows.\n'
