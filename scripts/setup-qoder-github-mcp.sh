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

echo "Downloading qoder-github MCP installer script from ${INSTALLER_URL}..."
curl -fsSL "${INSTALLER_URL}" -o "${TMP_INSTALLER}"
chmod +x "${TMP_INSTALLER}"

MCP_COMMAND="$("${TMP_INSTALLER}" --version "${QODER_GITHUB_MCP_VERSION}" --install-dir "${BIN_DIR}")"
echo "✓ qoder-github MCP server installed via installer script"

cat > "${HOME}/.qoder.json" <<EOF
{
  "mcpServers": {
    "qoder_github": {
      "command": "${MCP_COMMAND}",
      "args": ["stdio"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "GITHUB_REPOSITORY": "${GITHUB_REPOSITORY}",
        "GITHUB_RUN_ID": "${GITHUB_RUN_ID}",
        "GITHUB_SERVER_URL": "${GITHUB_SERVER_URL}"
      },
      "type": "stdio"
    }
  }
}
EOF

echo "✓ MCP configuration created at \$HOME/.qoder.json"

