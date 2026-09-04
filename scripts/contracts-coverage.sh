#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
coverage_root="$(mktemp -d)"
trap 'rm -rf "${coverage_root}"' EXIT

mkdir -p \
  "${coverage_root}/lib/openzeppelin/contracts" \
  "${coverage_root}/lib/asc-contracts" \
  "${coverage_root}/lib/forge-std"
cp -R "${project_root}/contracts/src" "${project_root}/contracts/test" "${coverage_root}/"
cp -RL "${project_root}/node_modules/@openzeppelin/contracts/." \
  "${coverage_root}/lib/openzeppelin/contracts/"
cp -RL "${project_root}/node_modules/@gluwa/asc-contracts/." \
  "${coverage_root}/lib/asc-contracts/"
cp -R "${project_root}/contracts/lib/forge-std/." "${coverage_root}/lib/forge-std/"

forge coverage \
  --root "${coverage_root}" \
  --use 0.8.28 \
  --evm-version cancun \
  -R 'forge-std/=lib/forge-std/src/' \
  -R '@openzeppelin/contracts/=lib/openzeppelin/contracts/' \
  -R '@gluwa/asc-contracts/=lib/asc-contracts/' \
  --ir-minimum \
  --report summary
