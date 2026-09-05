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

# asc-contracts 0.2.1 predates Solidity's memory-safe assembly annotation. The
# annotation is semantics-preserving and prevents a coverage-only viaIR stack
# allocation failure after decodeCommonTxFields is linked into AttestLockASC.
sed -i.bak 's/assembly {/assembly ("memory-safe") {/' \
  "${coverage_root}/lib/asc-contracts/contracts/common/EvmV1Decoder.sol"
rm "${coverage_root}/lib/asc-contracts/contracts/common/EvmV1Decoder.sol.bak"

coverage_summary="${coverage_root}/summary.txt"
NO_COLOR=1 FOUNDRY_INVARIANT_RUNS=256 FOUNDRY_INVARIANT_DEPTH=128 FOUNDRY_INVARIANT_FAIL_ON_REVERT=true forge coverage \
  --root "${coverage_root}" \
  --use 0.8.28 \
  --evm-version cancun \
  -R 'forge-std/=lib/forge-std/src/' \
  -R '@openzeppelin/contracts/=lib/openzeppelin/contracts/' \
  -R '@gluwa/asc-contracts/=lib/asc-contracts/' \
  --ir-minimum \
  --no-match-coverage '(^|/)test/' \
  --report summary | tee "${coverage_summary}"

read_coverage() {
  local column="$1"
  awk -F'|' -v column="${column}" '
    /^\| Total[[:space:]]/ {
      value = $column
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      split(value, pieces, "%")
      print pieces[1]
    }
  ' "${coverage_summary}"
}

assert_coverage() {
  local label="$1"
  local actual="$2"
  local minimum="$3"
  if ! awk -v actual="${actual}" -v minimum="${minimum}" 'BEGIN { exit !(actual + 0 >= minimum + 0) }'; then
    echo "${label} coverage ${actual}% is below the required ${minimum}%." >&2
    exit 1
  fi
}

assert_coverage "Line" "$(read_coverage 3)" "${MIN_LINE_COVERAGE:-95}"
assert_coverage "Statement" "$(read_coverage 4)" "${MIN_STATEMENT_COVERAGE:-93}"
assert_coverage "Branch" "$(read_coverage 5)" "${MIN_BRANCH_COVERAGE:-85}"
assert_coverage "Function" "$(read_coverage 6)" "${MIN_FUNCTION_COVERAGE:-90}"
