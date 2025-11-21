#!/usr/bin/env bash

set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "::error::Environment variable '${name}' is required for run-qodercli.sh" >&2
    exit 1
  fi
}

require_env GITHUB_WORKSPACE
require_env GITHUB_OUTPUT
require_env GITHUB_ACTION_PATH

setup_qoder_environment() {
  echo "::group::Setting up qodercli environment"
  echo "Setting up qodercli environment..."
  mkdir -p "${HOME}/.qoder/commands" "${HOME}/.qoder/subagents"

  if [[ -d "${GITHUB_ACTION_PATH}/.qoder" ]]; then
    if command -v rsync >/dev/null 2>&1; then
      if rsync -a "${GITHUB_ACTION_PATH}/.qoder/" "${HOME}/.qoder/"; then
        echo "✓ Built-in resources installed via rsync"
      else
        echo "::warning::Failed to copy built-in resources via rsync"
      fi
    else
      if cp -R "${GITHUB_ACTION_PATH}/.qoder/." "${HOME}/.qoder/" 2>/dev/null; then
        echo "✓ Built-in resources installed"
      else
        echo "::warning::Failed to copy built-in resources"
      fi
    fi
  fi
  echo "::endgroup::"
}

setup_qoder_environment

# Delegate execution to the Node.js wrapper
# The wrapper handles arguments, logging, output streams, and GitHub outputs
if ! command -v node >/dev/null 2>&1; then
  echo "::error::node is required to run qoder-wrapper.js" >&2
  exit 1
fi

node "${GITHUB_ACTION_PATH}/scripts/qoder-wrapper.js"
