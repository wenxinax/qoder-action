#!/usr/bin/env bash

set -euo pipefail

DEFAULT_BASE_URL="https://download.qoder.com/qodercli/mcp/qoder-github-mcp-server/releases"
DEFAULT_INSTALL_DIR="${HOME}/.local/bin"
DEFAULT_BIN_NAME="qoder-github-mcp-server"

log() {
  printf '[qoder-mcp-install] %s\n' "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

usage() {
  cat <<'EOF'
Usage: install-qoder-github-mcp.sh [--version <version>] [--install-dir <path>] [--base-url <url>] [--bin-name <name>] [--allow-missing-checksum]

Environment overrides:
  QODER_MCP_VERSION                 Default version (if --version not provided)
  QODER_MCP_BASE_URL                Alternative release base URL
  QODER_MCP_INSTALL_DIR             Installation directory (default: $HOME/.local/bin)
  QODER_MCP_BIN_NAME                Target binary name (default: qoder-github-mcp-server)
  QODER_MCP_ALLOW_MISSING_CHECKSUM  Set to "true" to skip checksum validation (NOT RECOMMENDED)

The script downloads the requested release, verifies its SHA256 checksum
(`<binary>.sha256`), installs it into the target directory, and prints the final
binary path on stdout.
EOF
  exit 1
}

VERSION="${QODER_MCP_VERSION:-}"
BASE_URL="${QODER_MCP_BASE_URL:-$DEFAULT_BASE_URL}"
INSTALL_DIR="${QODER_MCP_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
BIN_NAME="${QODER_MCP_BIN_NAME:-$DEFAULT_BIN_NAME}"
ALLOW_MISSING="${QODER_MCP_ALLOW_MISSING_CHECKSUM:-false}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --bin-name)
      BIN_NAME="${2:-}"
      shift 2
      ;;
    --allow-missing-checksum)
      ALLOW_MISSING="true"
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${VERSION}" ]] || usage
[[ -n "${INSTALL_DIR}" ]] || die "--install-dir cannot be empty"
[[ -n "${BIN_NAME}" ]] || die "--bin-name cannot be empty"

require_cmd curl
# Determine checksum command
CHECK_REDIRECT="false"
if command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD=(sha256sum --check --status)
elif command -v shasum >/dev/null 2>&1; then
  SHA_CMD=(shasum -a 256 -c)
  CHECK_REDIRECT="true"
else
  die "Neither sha256sum nor shasum is available for checksum validation"
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

BASE_URL="${BASE_URL%/}"
BINARY_URL="${BASE_URL}/${VERSION}/${BIN_NAME}"
CHECKSUM_URL="${BINARY_URL}.sha256"
ARCHIVE_PATH="${TMP_DIR}/${BIN_NAME}"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

log "Downloading ${BINARY_URL}"
curl -fsSL "${BINARY_URL}" -o "${ARCHIVE_PATH}"
chmod +x "${ARCHIVE_PATH}"

if [[ "${ALLOW_MISSING}" != "true" ]]; then
  log "Downloading checksum ${CHECKSUM_URL}"
  curl -fsSL "${CHECKSUM_URL}" -o "${CHECKSUM_PATH}"
  pushd "${TMP_DIR}" >/dev/null
  if [[ "${CHECK_REDIRECT}" == "true" ]]; then
    "${SHA_CMD[@]}" "$(basename "${CHECKSUM_PATH}")" >/dev/null
  else
    "${SHA_CMD[@]}" "$(basename "${CHECKSUM_PATH}")"
  fi
  popd >/dev/null
  log "Checksum verified successfully"
else
  log "WARNING: Checksum validation skipped (ALLOW_MISSING_CHECKSUM=true)"
fi

mkdir -p "${INSTALL_DIR}"
TARGET_PATH="${INSTALL_DIR%/}/${BIN_NAME}"
install -m 0755 "${ARCHIVE_PATH}" "${TARGET_PATH}"

log "Installed ${BIN_NAME} ${VERSION} to ${TARGET_PATH}"
printf '%s\n' "${TARGET_PATH}"

