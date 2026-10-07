#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" ]]; then
  echo "Usage: $0 <output_dir>" >&2
  exit 1
fi

OUTPUT_DIR="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ALLOWLIST=(
  ".github"
  ".gitignore"
  "README.md"
  "LICENSE"
  "CONTRIBUTING.md"
  "SECURITY.md"
  "OPEN_SOURCE_SCOPE.md"
  "manifest.json"
  "package.json"
  "package-lock.json"
  "background"
  "content-scripts"
  "icons"
  "landing"
  "popup"
  "sidepanel"
  "tests"
)

mkdir -p "${OUTPUT_DIR}"
rm -rf "${OUTPUT_DIR:?}/"*

for path in "${ALLOWLIST[@]}"; do
  src="${EXT_ROOT}/${path}"
  if [[ -e "${src}" ]]; then
    parent_dir="$(dirname "${OUTPUT_DIR}/${path}")"
    mkdir -p "${parent_dir}"
    cp -R "${src}" "${OUTPUT_DIR}/${path}"
  fi
done

rm -rf "${OUTPUT_DIR}/node_modules" || true
rm -f "${OUTPUT_DIR}/sally-extension.zip" || true
find "${OUTPUT_DIR}" -name ".DS_Store" -delete

echo "Export complete: ${OUTPUT_DIR}"
