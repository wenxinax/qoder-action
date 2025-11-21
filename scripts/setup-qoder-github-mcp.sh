#!/usr/bin/env bash

set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "::error::Environment variable '${name}' is required for setup-qoder-github-mcp.sh" >&2
    exit 1
  fi
}

require_env GITHUB_TOKEN
require_env GITHUB_REPOSITORY
require_env GITHUB_RUN_ID
require_env GITHUB_SERVER_URL
require_env QODER_GITHUB_MCP_VERSION
require_env GITHUB_PATH

BIN_DIR="${HOME}/.local/bin"
mkdir -p "${BIN_DIR}"
echo "${BIN_DIR}" >> "${GITHUB_PATH}"

INSTALLER_URL="${QODER_GITHUB_MCP_INSTALLER_URL:-https://download.qoder.com/qodercli/mcp/qoder-github-mcp-server/install.sh}"
TMP_INSTALLER="$(mktemp)"
cleanup() {
  rm -f "${TMP_INSTALLER}"
}
trap cleanup EXIT

echo "::group::Installing qoder-github MCP server"
echo "Downloading qoder-github MCP installer script from ${INSTALLER_URL}..."
curl -fsSL "${INSTALLER_URL}" -o "${TMP_INSTALLER}"
chmod +x "${TMP_INSTALLER}"

# Run installer quietly, capture output to log file
INSTALL_LOG="$(mktemp)"
echo "Running installer..."

set +e
"${TMP_INSTALLER}" --version "${QODER_GITHUB_MCP_VERSION}" --install-dir "${BIN_DIR}" > "${INSTALL_LOG}" 2>&1
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "::endgroup::"
  echo "::error::qoder-github MCP server installation failed"
  echo "::group::Installation Log"
  cat "${INSTALL_LOG}"
  echo "::endgroup::"
  rm -f "${INSTALL_LOG}"
  exit $EXIT_CODE
fi

rm -f "${INSTALL_LOG}"
echo "::endgroup::"
echo "✓ qoder-github MCP server installed via installer script"

# Use the command name directly since BIN_DIR is in PATH
MCP_COMMAND="qoder-github-mcp-server"
echo "MCP command: ${MCP_COMMAND}"

CONFIG_FILE="${HOME}/.qoder.json"
if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "{}" > "${CONFIG_FILE}"
fi

# Use jq to merge configuration instead of overwriting
TMP_CONFIG="$(mktemp)"
if jq --arg cmd "${MCP_COMMAND}" \
   --arg token "${GITHUB_TOKEN}" \
   --arg repo "${GITHUB_REPOSITORY}" \
   --arg runid "${GITHUB_RUN_ID}" \
   --arg server "${GITHUB_SERVER_URL}" \
   '.mcpServers.qoder_github = {
     "command": $cmd,
     "args": ["stdio"],
     "env": {
       "GITHUB_TOKEN": $token,
       "GITHUB_REPOSITORY": $repo,
       "GITHUB_RUN_ID": $runid,
       "GITHUB_SERVER_URL": $server
     },
     "type": "stdio"
   }' "${CONFIG_FILE}" > "${TMP_CONFIG}"; then
   mv "${TMP_CONFIG}" "${CONFIG_FILE}"
   echo "✓ MCP configuration updated at ${CONFIG_FILE}"
else
   echo "::error::Failed to update MCP configuration using jq"
   exit 1
fi
rm -f "${TMP_CONFIG}"
