import {
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  formatUnits,
  getAddress,
  isHexString,
  Interface,
} from 'ethers';
import { readFile } from 'node:fs/promises';

const addressKeys = [
  'SOURCE_TOKEN_ADDRESS',
  'SOURCE_VAULT_ADDRESS',
  'MOCK_USD_ADDRESS',
  'CREDIT_POOL_ADDRESS',
  'ATTESTLOCK_ASC_ADDRESS',
];
const required = [
  'SOURCE_CHAIN_RPC_URL',
  'CREDITCOIN_RPC_URL',
  ...addressKeys,
  'LOCK_ID',
  'QUERY_ID',
  'LOCK_TX_HASH',
  'PROOF_TX_HASH',
  'BORROW_TX_HASH',
  'REPAY_TX_HASH',
  'JUNK_TX_HASH',
  'TAMPERED_PROOF_TX_HASH',
  'DUPLICATE_QUERY_TX_HASH',
  'EXPECTED_BORROWER',
  'RELAYER_ADDRESS',
  'REPAY_PAYER',
  'WORKER_URL',
  'JUNK_JOB_ID',
  'PROOF_FIXTURE_FILE',
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}.`);
}

const source = new JsonRpcProvider(process.env.SOURCE_CHAIN_RPC_URL);
const destination = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
for (const key of [
  'LOCK_ID',
  'QUERY_ID',
  'LOCK_TX_HASH',
  'PROOF_TX_HASH',
  'BORROW_TX_HASH',
  'REPAY_TX_HASH',
  'JUNK_TX_HASH',
  'TAMPERED_PROOF_TX_HASH',
  'DUPLICATE_QUERY_TX_HASH',
]) {
  if (!isHexString(process.env[key], 32)) throw new Error(`${key} must be 32 bytes.`);
}
const addresses = Object.fromEntries(addressKeys.map((key) => [key, getAddress(process.env[key])]));
const expectedBorrower = getAddress(process.env.EXPECTED_BORROWER);
const expectedRelayer = getAddress(process.env.RELAYER_ADDRESS);
const expectedRepayPayer = getAddress(process.env.REPAY_PAYER);
const [sourceNetwork, destinationNetwork] = await Promise.all([
  source.getNetwork(),
  destination.getNetwork(),
]);
if (sourceNetwork.chainId !== 11_155_111n) throw new Error('Source RPC is not Sepolia.');
if (destinationNetwork.chainId !== 102_031n) throw new Error('Destination RPC is not Creditcoin testnet.');

for (const key of ['SOURCE_TOKEN_ADDRESS', 'SOURCE_VAULT_ADDRESS']) {
  if ((await source.getCode(addresses[key])) === '0x') throw new Error(`${key} has no Sepolia bytecode.`);
}
for (const key of ['MOCK_USD_ADDRESS', 'CREDIT_POOL_ADDRESS', 'ATTESTLOCK_ASC_ADDRESS']) {
  if ((await destination.getCode(addresses[key])) === '0x') {
    throw new Error(`${key} has no Creditcoin bytecode.`);
  }
}

const vault = new Contract(
  addresses.SOURCE_VAULT_ADDRESS,
  [
    'function collateralToken() view returns (address)',
    'event CollateralLocked(bytes32 indexed lockId,address indexed borrower,address indexed token,uint256 amount,uint64 unlockAt)',
  ],
  source
);
const pool = new Contract(
  addresses.CREDIT_POOL_ADDRESS,
  [
    'function asset() view returns (address)',
    'function asc() view returns (address)',
    'function lines(bytes32) view returns (address,uint256,uint256,uint64,uint256,uint64,bytes32)',
    'function borrowerProfiles(address) view returns (uint256,uint256,uint256,uint256,uint256)',
    'event Borrowed(bytes32 indexed lockId,address indexed borrower,uint256 amount,uint256 debt)',
    'event Repaid(bytes32 indexed lockId,address indexed payer,uint256 amount,uint256 debt)',
  ],
  destination
);
const asc = new Contract(
  addresses.ATTESTLOCK_ASC_ADDRESS,
  [
    'function verifier() view returns (address)',
    'function pool() view returns (address)',
    'function sourceVault() view returns (address)',
    'function sourceToken() view returns (address)',
    'function usedLocks(bytes32) view returns (bool)',
    'function processedQueries(bytes32) view returns (bool)',
    'event LockVerifiedAndLineOpened(bytes32 indexed queryId,bytes32 indexed lockId,address indexed borrower,uint256 collateralAmount,uint256 creditLimit,uint64 maturity,uint64 collateralUnlockAt)',
  ],
  destination
);
const asset = new Contract(
  addresses.MOCK_USD_ADDRESS,
  ['function balanceOf(address) view returns (uint256)'],
  destination
);

const bindings = {
  vaultToken: getAddress(await vault.collateralToken()),
  poolAsset: getAddress(await pool.asset()),
  poolAsc: getAddress(await pool.asc()),
  ascVerifier: getAddress(await asc.verifier()),
  ascPool: getAddress(await asc.pool()),
  ascSourceVault: getAddress(await asc.sourceVault()),
  ascSourceToken: getAddress(await asc.sourceToken()),
};
const expected = {
  vaultToken: addresses.SOURCE_TOKEN_ADDRESS,
  poolAsset: addresses.MOCK_USD_ADDRESS,
  poolAsc: addresses.ATTESTLOCK_ASC_ADDRESS,
  ascVerifier: '0x0000000000000000000000000000000000000FD2',
  ascPool: addresses.CREDIT_POOL_ADDRESS,
  ascSourceVault: addresses.SOURCE_VAULT_ADDRESS,
  ascSourceToken: addresses.SOURCE_TOKEN_ADDRESS,
};
for (const [key, value] of Object.entries(expected)) {
  if (bindings[key] !== getAddress(value) || bindings[key] === ZeroAddress) {
    throw new Error(`Immutable binding mismatch for ${key}.`);
  }
}

const lockId = process.env.LOCK_ID;
const queryId = process.env.QUERY_ID;
const fixture = JSON.parse(await readFile(process.env.PROOF_FIXTURE_FILE, 'utf8'));
const proofInterface = new Interface([
  'function verifyLockAndOpenLine(uint64,uint64,bytes,bytes32,(bytes32 hash,bool isLeft)[],bytes32,bytes32[]) returns (bool)',
  'error ProofVerificationFailed()',
  'error QueryAlreadyProcessed()',
]);
const line = await pool.lines(lockId);
if (line[0] === ZeroAddress) throw new Error('LOCK_ID has no credit line.');
if (getAddress(line[0]) !== expectedBorrower) throw new Error('Credit line borrower does not match signer.');
if (String(line[6]).toLowerCase() !== queryId.toLowerCase())
  throw new Error('Credit line query ID mismatch.');
if (BigInt(line[1]) * 2n !== BigInt(line[4])) throw new Error('Credit line is not exactly 50% LTV.');
if (BigInt(line[2]) !== 0n)
  throw new Error('Final evidence requires the demonstrated line to be fully repaid.');
if (BigInt(line[5]) < BigInt(line[3]) + 86_400n) {
  throw new Error('Collateral expiry does not retain the one-day post-maturity buffer.');
}
if (!(await asc.usedLocks(lockId)) || !(await asc.processedQueries(queryId))) {
  throw new Error('ASC replay flags are not set for the evidenced line.');
}

async function transactionEvidence(provider, hash, expectedTo, expectedFrom, expectedStatus, label) {
  const [transaction, receipt] = await Promise.all([
    provider.getTransaction(hash),
    provider.getTransactionReceipt(hash),
  ]);
  if (!transaction || !receipt) throw new Error(`${label} transaction or receipt is missing.`);
  if (receipt.status !== expectedStatus) throw new Error(`${label} receipt status mismatch.`);
  if (expectedTo && (!transaction.to || getAddress(transaction.to) !== getAddress(expectedTo))) {
    throw new Error(`${label} destination mismatch.`);
  }
  if (expectedFrom && getAddress(transaction.from) !== getAddress(expectedFrom)) {
    throw new Error(`${label} signer mismatch.`);
  }
  return { transaction, receipt };
}

const lockExecution = await transactionEvidence(
  source,
  process.env.LOCK_TX_HASH,
  addresses.SOURCE_VAULT_ADDRESS,
  expectedBorrower,
  1,
  'lock'
);
const proofExecution = await transactionEvidence(
  destination,
  process.env.PROOF_TX_HASH,
  addresses.ATTESTLOCK_ASC_ADDRESS,
  expectedRelayer,
  1,
  'proof'
);
const borrowExecution = await transactionEvidence(
  destination,
  process.env.BORROW_TX_HASH,
  addresses.CREDIT_POOL_ADDRESS,
  expectedBorrower,
  1,
  'borrow'
);
const repayExecution = await transactionEvidence(
  destination,
  process.env.REPAY_TX_HASH,
  addresses.CREDIT_POOL_ADDRESS,
  expectedRepayPayer,
  1,
  'repay'
);
const tamperedExecution = await transactionEvidence(
  destination,
  process.env.TAMPERED_PROOF_TX_HASH,
  addresses.ATTESTLOCK_ASC_ADDRESS,
  null,
  0,
  'tampered proof'
);
const replayExecution = await transactionEvidence(
  destination,
  process.env.DUPLICATE_QUERY_TX_HASH,
  addresses.ATTESTLOCK_ASC_ADDRESS,
  null,
  0,
  'duplicate query'
);
const junkExecution = await transactionEvidence(
  source,
  process.env.JUNK_TX_HASH,
  null,
  null,
  1,
  'junk source'
);
if (
  junkExecution.transaction.to &&
  getAddress(junkExecution.transaction.to) === addresses.SOURCE_VAULT_ADDRESS
) {
  throw new Error('JUNK_TX_HASH unexpectedly targets LockVault.');
}
const refusalResponse = await fetch(new URL(`/api/jobs/${process.env.JUNK_JOB_ID}`, process.env.WORKER_URL), {
  signal: AbortSignal.timeout(10_000),
});
if (!refusalResponse.ok) throw new Error('Junk refusal job is not publicly retrievable.');
const refusal = await refusalResponse.json();
if (
  refusal.txHash?.toLowerCase() !== process.env.JUNK_TX_HASH.toLowerCase() ||
  refusal.status !== 'refused' ||
  refusal.errorCode !== 'WRONG_SOURCE_CONTRACT' ||
  refusal.evidence?.creditcoinSubmissionTxHash
) {
  throw new Error('Junk evidence must be an actual source-contract refusal without a funded submission.');
}

// Require the committed proof tuple to encode exactly the successful call.
if (
  !Array.isArray(fixture.proofArguments) ||
  fixture.proofArguments.length !== 7 ||
  fixture.queryId?.toLowerCase() !== queryId.toLowerCase()
)
  throw new Error('Real proof fixture tuple/query ID is missing.');
const validCalldata = proofInterface.encodeFunctionData('verifyLockAndOpenLine', fixture.proofArguments);
if (validCalldata.toLowerCase() !== proofExecution.transaction.data.toLowerCase())
  throw new Error('Fixture is not the successful proof transaction calldata.');
if (replayExecution.transaction.data.toLowerCase() !== validCalldata.toLowerCase())
  throw new Error('Query replay must repeat identical successful calldata.');
const originalArgs = proofInterface.decodeFunctionData('verifyLockAndOpenLine', validCalldata);
const tamperedArgs = proofInterface.decodeFunctionData(
  'verifyLockAndOpenLine',
  tamperedExecution.transaction.data
);
// Canonical negative demo: mutate only encoded transaction bytes; query path stays identical.
const expectedTamper = [...originalArgs];
expectedTamper[2] = tamperedArgs[2];
if (
  originalArgs[2] === tamperedArgs[2] ||
  proofInterface.encodeFunctionData('verifyLockAndOpenLine', expectedTamper).toLowerCase() !==
    tamperedExecution.transaction.data.toLowerCase()
)
  throw new Error('Tampered evidence must mutate only txBytes of the same unused query.');
if (
  tamperedExecution.receipt.blockNumber >= proofExecution.receipt.blockNumber ||
  replayExecution.receipt.blockNumber <= proofExecution.receipt.blockNumber
)
  throw new Error('Record tamper, valid proof, and replay in separate, ordered blocks.');
if (await asc.processedQueries(queryId, { blockTag: tamperedExecution.receipt.blockNumber - 1 }))
  throw new Error('Tampered query was already used; replay protection would mask verification.');

async function requireRevertReason(execution, name) {
  let data;
  try {
    await destination.call({
      to: execution.transaction.to,
      from: execution.transaction.from,
      data: execution.transaction.data,
      value: execution.transaction.value,
      gasLimit: execution.transaction.gasLimit,
      blockTag: execution.receipt.blockNumber - 1,
    });
  } catch (error) {
    data = error.data ?? error.info?.error?.data;
  }
  if (typeof data !== 'string' || data !== proofInterface.encodeErrorResult(name))
    throw new Error(
      `Could not reproduce exact ${name} at the prior block. Arbitrary reverts are not evidence.`
    );
}
await requireRevertReason(tamperedExecution, 'ProofVerificationFailed');
await requireRevertReason(replayExecution, 'QueryAlreadyProcessed');

function oneEvent(contract, receipt, name, expectedLockId) {
  const events = receipt.logs.flatMap((log) => {
    if (log.address.toLowerCase() !== String(contract.target).toLowerCase()) return [];
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed?.name === name &&
        (!expectedLockId || String(parsed.args.lockId).toLowerCase() === expectedLockId.toLowerCase())
        ? [parsed]
        : [];
    } catch {
      return [];
    }
  });
  if (events.length !== 1) throw new Error(`${name} evidence event is missing or ambiguous.`);
  return events[0];
}

const lockEvent = oneEvent(vault, lockExecution.receipt, 'CollateralLocked', lockId);
if (getAddress(lockEvent.args.borrower) !== expectedBorrower)
  throw new Error('Lock event borrower mismatch.');
const proofEvent = oneEvent(asc, proofExecution.receipt, 'LockVerifiedAndLineOpened', lockId);
if (String(proofEvent.args.queryId).toLowerCase() !== queryId.toLowerCase()) {
  throw new Error('Proof event query ID mismatch.');
}
if (BigInt(proofEvent.args.creditLimit) !== BigInt(line[1])) throw new Error('Proof event limit mismatch.');
if (
  BigInt(lockEvent.args.amount) !== 100_000_000n ||
  BigInt(line[4]) !== BigInt(lockEvent.args.amount) ||
  getAddress(lockEvent.args.token) !== addresses.SOURCE_TOKEN_ADDRESS ||
  BigInt(lockEvent.args.unlockAt) !== BigInt(line[5]) ||
  getAddress(proofEvent.args.borrower) !== expectedBorrower ||
  BigInt(proofEvent.args.collateralAmount) !== BigInt(line[4]) ||
  BigInt(proofEvent.args.maturity) !== BigInt(line[3]) ||
  BigInt(proofEvent.args.collateralUnlockAt) !== BigInt(line[5])
)
  throw new Error('Source lock, ASC event, and line facts do not match exactly.');
const borrowEvent = oneEvent(pool, borrowExecution.receipt, 'Borrowed', lockId);
if (BigInt(borrowEvent.args.amount) !== BigInt(line[1])) {
  throw new Error('Borrower did not draw the exact demonstrated 50% line.');
}
const repayEvent = oneEvent(pool, repayExecution.receipt, 'Repaid', lockId);
if (
  getAddress(repayEvent.args.payer) !== expectedRepayPayer ||
  BigInt(repayEvent.args.amount) !== 50_000_000n ||
  BigInt(repayEvent.args.debt) !== 0n
)
  throw new Error('Repayment must close the exact 50 mUSD demonstrated debt.');

const [proofBlock, borrowBlock, repayBlock] = await Promise.all([
  destination.getBlock(proofExecution.receipt.blockNumber),
  destination.getBlock(borrowExecution.receipt.blockNumber),
  destination.getBlock(repayExecution.receipt.blockNumber),
]);
if (!proofBlock || !borrowBlock || !repayBlock) throw new Error('Evidence block timestamps are unavailable.');
if (Number(line[3]) !== proofBlock.timestamp + 7 * 24 * 60 * 60) {
  throw new Error('Credit line maturity is not exactly seven days after proof execution.');
}
if (borrowBlock.timestamp >= Number(line[3])) throw new Error('Borrow transaction occurred after maturity.');
if (repayBlock.timestamp < Number(line[3])) throw new Error('Repayment evidence is not post-maturity.');

const profile = await pool.borrowerProfiles(expectedBorrower);
if (BigInt(profile[2]) - BigInt(profile[3]) !== BigInt(profile[4])) {
  throw new Error('Borrower profile accounting invariant failed.');
}
const poolLiquidityAtomic = await asset.balanceOf(addresses.CREDIT_POOL_ADDRESS);
if (poolLiquidityAtomic < BigInt(process.env.MIN_POOL_LIQUIDITY_ATOMIC ?? '1')) {
  throw new Error('Credit pool liquidity is below the evidence floor.');
}

async function stateAt(blockTag) {
  const [historicalLine, historicalProfile, usedLock, usedQuery, poolBalance, borrowerBalance] =
    await Promise.all([
      pool.lines(lockId, { blockTag }),
      pool.borrowerProfiles(expectedBorrower, { blockTag }),
      asc.usedLocks(lockId, { blockTag }),
      asc.processedQueries(queryId, { blockTag }),
      asset.balanceOf(addresses.CREDIT_POOL_ADDRESS, { blockTag }),
      asset.balanceOf(expectedBorrower, { blockTag }),
    ]);
  return JSON.stringify({
    line: [...historicalLine].map(String),
    profile: [...historicalProfile].map(String),
    usedLock,
    usedQuery,
    poolBalance: String(poolBalance),
    borrowerBalance: String(borrowerBalance),
  });
}
for (const [label, receipt] of [
  ['tampered proof', tamperedExecution.receipt],
  ['duplicate query', replayExecution.receipt],
]) {
  const before = await stateAt(receipt.blockNumber - 1);
  const after = await stateAt(receipt.blockNumber);
  if (before !== after) throw new Error(`${label} changed destination state.`);
}

const evidence = {
  schemaVersion: 1,
  proofArguments: fixture.proofArguments,
  junkRefusal: {
    id: refusal.id,
    txHash: refusal.txHash,
    status: refusal.status,
    errorCode: refusal.errorCode,
  },
  checkedAt: new Date().toISOString(),
  chains: { source: Number(sourceNetwork.chainId), destination: Number(destinationNetwork.chainId) },
  addresses,
  bindings,
  signers: { borrower: expectedBorrower, relayer: expectedRelayer, repayPayer: expectedRepayPayer },
  poolLiquidityAtomic: poolLiquidityAtomic.toString(),
  poolLiquidity: formatUnits(poolLiquidityAtomic, 6),
  lock: {
    lockId,
    used: true,
    borrower: expectedBorrower,
    limitAtomic: String(line[1]),
    limit: formatUnits(line[1], 6),
    debtAtomic: String(line[2]),
    maturity: Number(line[3]),
    collateralAmountAtomic: String(line[4]),
    collateralUnlockAt: Number(line[5]),
    queryId,
  },
  profile: {
    lineCount: Number(profile[0]),
    totalCreditOpenedAtomic: String(profile[1]),
    totalBorrowedAtomic: String(profile[2]),
    totalRepaidAtomic: String(profile[3]),
    outstandingDebtAtomic: String(profile[4]),
  },
  transactions: Object.fromEntries(
    [
      ['lock', lockExecution.receipt],
      ['proof', proofExecution.receipt],
      ['borrow', borrowExecution.receipt],
      ['repay', repayExecution.receipt],
      ['junk', junkExecution.receipt],
      ['tamperedProof', tamperedExecution.receipt],
      ['duplicateQuery', replayExecution.receipt],
    ].map(([name, receipt]) => [
      name,
      { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status },
    ])
  ),
  invalidPathStateInvariant: true,
  queryProcessed: true,
};
console.log(JSON.stringify(evidence, null, 2));
