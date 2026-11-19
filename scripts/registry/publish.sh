#!/usr/bin/env bash
# Publishes server.json to the MCP Registry from this computer (docs/MCP.md, "Getting listed").
#
# Why this exists: mcp-publisher's own "login github" waits for GitHub with its built-in network client, which
# kept timing out here ("TLS handshake timeout") after the owner had approved. This does the same GitHub
# device sign-in with curl, retrying through timeouts, then gives the token to mcp-publisher. The token is held
# only in a shell variable: never printed, never written to disk.
#
#   MCP_PUBLISHER=/path/to/mcp-publisher bash scripts/registry/publish.sh
#
# Get mcp-publisher from https://github.com/modelcontextprotocol/registry/releases and check it against the
# release's checksums file. The GitHub Actions workflow (.github/workflows/publish-registry.yml) is the
# alternative when Actions can run.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
P="${MCP_PUBLISHER:-mcp-publisher}"
LOG="${LOG:-${TMPDIR:-/tmp}/atlas-registry-publish.log}"
: > "$LOG"
say() { echo "$1" | tee -a "$LOG"; }

"$P" --version >/dev/null 2>&1 || { say "ERROR: mcp-publisher not found; set MCP_PUBLISHER"; exit 1; }
# The registry publishes the GitHub app ID its publisher signs in with.
CLIENT_ID=$(curl -s --max-time 30 https://registry.modelcontextprotocol.io/v0/health | sed -n 's/.*"github_client_id":"\([^"]*\)".*/\1/p')
[ -n "$CLIENT_ID" ] || { say "ERROR: the registry didn't give its GitHub client ID"; exit 1; }
DEV=$(curl -s --max-time 30 --retry 3 -X POST -H 'Accept: application/json' -d "client_id=$CLIENT_ID&scope=read:org read:user" https://github.com/login/device/code)
DEVICE_CODE=$(printf '%s' "$DEV" | sed -n 's/.*"device_code":"\([^"]*\)".*/\1/p')
USER_CODE=$(printf '%s' "$DEV" | sed -n 's/.*"user_code":"\([^"]*\)".*/\1/p')
INTERVAL=$(printf '%s' "$DEV" | sed -n 's/.*"interval":\([0-9]*\).*/\1/p')
[ -n "$DEVICE_CODE" ] || { say "ERROR: GitHub didn't give a device code"; exit 1; }
say "Go to https://github.com/login/device, enter $USER_CODE, then click Authorize."
INTERVAL=${INTERVAL:-5}
TOKEN=""
for i in $(seq 1 180); do
  sleep "$INTERVAL"
  R=$(curl -s --max-time 30 --retry 3 --retry-delay 2 -X POST -H 'Accept: application/json' \
    -d "client_id=$CLIENT_ID&device_code=$DEVICE_CODE&grant_type=urn:ietf:params:oauth:grant-type:device_code" \
    https://github.com/login/oauth/access_token) || { echo "check $i: network error, retrying" >> "$LOG"; continue; }
  TOKEN=$(printf '%s' "$R" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  [ -n "$TOKEN" ] && break
  ERR=$(printf '%s' "$R" | sed -n 's/.*"error":"\([^"]*\)".*/\1/p')
  case "$ERR" in
    authorization_pending|"") ;;
    slow_down) INTERVAL=$((INTERVAL + 5)) ;;
    *) say "ERROR: GitHub said $ERR"; exit 1 ;;
  esac
done
[ -n "$TOKEN" ] || { say "ERROR: not approved before the code expired"; exit 1; }
say "Approved."
cd "$ROOT"
"$P" validate >> "$LOG" 2>&1 || { say "ERROR: server.json isn't valid"; exit 1; }
"$P" login github --token "$TOKEN" >> "$LOG" 2>&1 || { unset TOKEN; say "ERROR: registry login failed"; exit 1; }
unset TOKEN
"$P" publish 2>&1 | tee -a "$LOG"
