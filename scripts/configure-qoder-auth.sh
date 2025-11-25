#!/usr/bin/env bash

set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "::error::Environment variable '${name}' is required for configure-qoder-auth.sh" >&2
    exit 1
  fi
}

require_env QODER_PERSONAL_ACCESS_TOKEN
require_env GITHUB_SERVER_URL
require_env GITHUB_REPOSITORY

echo "::group::Configuring authentication"
echo "Requesting OIDC token..."
if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]]; then
  echo "::error::OIDC token request failed. Please ensure workflow has 'permissions: id-token: write'" >&2
  exit 1
fi

RESPONSE="$(curl -sSf -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=qoder-action")"
OIDC_TOKEN="$(echo "${RESPONSE}" | jq -r '.value')"

if [[ -z "${OIDC_TOKEN}" || "${OIDC_TOKEN}" == "null" ]]; then
  echo "::error::Failed to extract OIDC token from response" >&2
  exit 1
fi

EXCHANGE_URL="https://qoder.com/api/github/github-app-token-exchange"
TOKEN_RESPONSE_FILE="$(mktemp)"
HTTP_CODE="$(curl -X POST -w "%{http_code}" -s -o "${TOKEN_RESPONSE_FILE}" \
  -H "Authorization: Bearer ${OIDC_TOKEN}" \
  -H "X-Qoder-Personal-Access-Token: ${QODER_PERSONAL_ACCESS_TOKEN}" \
  "${EXCHANGE_URL}")"

# Check if response is empty or not valid
if [[ ! -s "${TOKEN_RESPONSE_FILE}" ]]; then
    echo "::error::Empty response from token exchange endpoint" >&2
    rm -f "${TOKEN_RESPONSE_FILE}"
    exit 1
fi

TOKEN_RESPONSE="$(cat "${TOKEN_RESPONSE_FILE}")"
rm -f "${TOKEN_RESPONSE_FILE}"

# Verify JSON validity before parsing
if ! echo "${TOKEN_RESPONSE}" | jq empty >/dev/null 2>&1; then
  echo "::error::Invalid JSON response from token exchange endpoint (HTTP ${HTTP_CODE}): ${TOKEN_RESPONSE}" >&2
  exit 1
fi

if [[ "${HTTP_CODE}" -ne 200 ]]; then
  ERROR_MESSAGE="$(echo "${TOKEN_RESPONSE}" | jq -r '.errorMessage // "Unknown"')"
  REQUEST_ID="$(echo "${TOKEN_RESPONSE}" | jq -r '.requestId // "N/A"')"

  if echo "${ERROR_MESSAGE}" | grep -qi "invalid personal access token"; then
    echo "::error::Your Qoder Personal Access Token is invalid or expired. Please update the secret and try again." >&2
  elif echo "${ERROR_MESSAGE}" | grep -qi "no authorized record\|GitHub App is not installed"; then
    echo "::error::The Qoder GitHub App is not configured correctly. Please run /setup-github locally to complete the configuration." >&2
  elif echo "${ERROR_MESSAGE}" | grep -qi "invalid OIDC token"; then
    echo "::error::OIDC authentication failed. Please re-run the job." >&2
  else
    echo "::error::Please contact Qoder support with the Request ID: ${REQUEST_ID}" >&2
  fi

  exit 1
fi

GITHUB_TOKEN="$(echo "${TOKEN_RESPONSE}" | jq -r '.token // empty')"
if [[ -n "${GITHUB_TOKEN}" ]]; then
  echo "::add-mask::${GITHUB_TOKEN}"
fi

if [[ -z "${GITHUB_TOKEN}" ]]; then
  echo "::error::Failed to read installation token from exchange response" >&2
  exit 1
fi

echo "github_token=${GITHUB_TOKEN}" >> "${GITHUB_OUTPUT}"

BOT_LOGIN="qoderai[bot]"
BOT_ID="215938697"

SERVER_HOST="$(echo "${GITHUB_SERVER_URL}" | sed 's|https\?://||' | sed 's|/.*||')"
if [[ "${SERVER_HOST}" == "github.com" ]]; then
  NOREPLY_DOMAIN="users.noreply.github.com"
else
  NOREPLY_DOMAIN="users.noreply.${SERVER_HOST}"
fi

git config user.name "${BOT_LOGIN}"
git config user.email "${BOT_ID}+${BOT_LOGIN}@${NOREPLY_DOMAIN}"
git config --unset-all "http.${GITHUB_SERVER_URL}/.extraheader" 2>/dev/null || true

REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@${SERVER_HOST}/${GITHUB_REPOSITORY}.git"
git remote set-url origin "${REMOTE_URL}"
echo "::endgroup::"
echo "✓ Git credentials configured"

