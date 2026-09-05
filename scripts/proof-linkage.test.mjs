import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { proofInterface, validateTamperLinkage } from './proof-linkage.mjs';

const fixture = JSON.parse(
  await readFile(new URL('../fixtures/proofs/sepolia-lock-2026-09-05.json', import.meta.url), 'utf8')
);
const args = fixture.proofArguments;
const encode = (value) => proofInterface.encodeFunctionData('verifyLockAndOpenLine', value);
const mutated = [...args];
mutated[2] = `${args[2].slice(0, -2)}${args[2].endsWith('00') ? '01' : '00'}`;
test('links a txBytes-only tamper to an identical or continuity-extended successful proof', () => {
  assert.equal(validateTamperLinkage(encode(args), encode(mutated), args), encode(args));
  const extended = [...args];
  extended[6] = [...args[6], `0x${'42'.repeat(32)}`];
  assert.equal(validateTamperLinkage(encode(extended), encode(mutated), args), encode(args));
});
test('rejects arbitrary reverted calldata, changed query facts, or changed continuity roots', () => {
  assert.throws(() => validateTamperLinkage(encode(args), encode(args), args));
  const wrongQuery = [...mutated];
  wrongQuery[1] += 1;
  assert.throws(() => validateTamperLinkage(encode(args), encode(wrongQuery), args));
  const wrongSuccess = [...args];
  wrongSuccess[1] += 1;
  assert.throws(() => validateTamperLinkage(encode(wrongSuccess), encode(mutated), args));
  const wrongRoot = [...args];
  wrongRoot[6] = [`0x${'42'.repeat(32)}`, ...args[6].slice(1)];
  assert.throws(() => validateTamperLinkage(encode(wrongRoot), encode(mutated), args));
});
