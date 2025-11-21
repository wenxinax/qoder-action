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
}

setup_qoder_environment

OUTPUT_FILE="/tmp/qoder-output-$(date +%s).log"
ERROR_FILE="/tmp/qoder-error-$(date +%s).log"

ARGS=("-w" "${GITHUB_WORKSPACE}")

if [[ -n "${INPUT_PROMPT:-}" ]]; then
  # Handle escape sequences like \n in the prompt string
  PROCESSED_PROMPT=$(printf '%b' "${INPUT_PROMPT}")
  ARGS+=("-p" "${PROCESSED_PROMPT}")
fi

if [[ -n "${INPUT_FLAGS:-}" ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "::error::node is required to parse multi-token flags." >&2
    exit 1
  fi

  while IFS= read -r token; do
    [[ -n "${token}" ]] && ARGS+=("${token}")
  done < <(node - <<'JS'
const input = process.env.INPUT_FLAGS || "";
const lines = input.split("\n");
// Match non-whitespace OR double-quoted content OR single-quoted content
const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;

for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    
    let match;
    while ((match = regex.exec(line)) !== null) {
        // match[1] is double quoted content, match[2] is single quoted content
        if (match[1] !== undefined) {
            console.log(match[1]);
        } else if (match[2] !== undefined) {
            console.log(match[2]);
        } else {
            console.log(match[0]);
        }
    }
}
JS
)
fi

if ! printf '%s\n' "${ARGS[@]}" | grep -qE '(^|[[:space:]])(-f|--output-format)([[:space:]]|$)'; then
  ARGS+=("-f" "stream-json")
fi

echo "Executing qodercli with arguments:"
printf '  %s\n' "${ARGS[@]}"
echo ""

set +e
qodercli "${ARGS[@]}" > >(tee "${OUTPUT_FILE}") 2> >(tee "${ERROR_FILE}" >&2)
EXIT_CODE=$?
set -e

echo "output_file=${OUTPUT_FILE}" >> "${GITHUB_OUTPUT}"
if [[ -s "${ERROR_FILE}" ]]; then
  {
    echo "error<<QODER_ERROR_EOF"
    cat "${ERROR_FILE}"
    echo "QODER_ERROR_EOF"
  } >> "${GITHUB_OUTPUT}"
else
  echo "error=" >> "${GITHUB_OUTPUT}"
fi

if [[ ${EXIT_CODE} -eq 0 ]]; then
  echo "✓ qodercli executed successfully"
else
  echo "::error::qodercli failed with exit code ${EXIT_CODE}"
  if [[ -s "${ERROR_FILE}" ]]; then
    while IFS= read -r line; do
      echo "::error::${line}"
    done < "${ERROR_FILE}"
  fi
  exit "${EXIT_CODE}"
fi

