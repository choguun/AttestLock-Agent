import { readFile, writeFile } from 'node:fs/promises';
import { Contract, JsonRpcProvider } from 'ethers';
import { proofInterface, validateTamperLinkage } from './proof-linkage.mjs';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const original = await read('fixtures/proofs/sepolia-lock-2026-09-05.json');
const execution = await read('.tmp/valid-proof-execution.json');
const tamper = await read('.tmp/tampered-proof.json');
const replay = await read('.tmp/replayed-proof.json');
const destination = await read('deployments/creditcoin-testnet.json');
const rpc = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const api = 'https://attestlock-worker-production.up.railway.app';
const stringify = (value) =>
  JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item), 2);
try {
  const transaction = await rpc.getTransaction(execution.hash);
  const receipt = await rpc.getTransactionReceipt(execution.hash);
  if (
    receipt?.status !== 1 ||
    transaction?.to?.toLowerCase() !== destination.contracts.AttestLockASC.toLowerCase()
  )
    throw new Error('Native execution not verified');
  const tamperedTransaction = await rpc.getTransaction(tamper.hash);
  const replayTransaction = await rpc.getTransaction(replay.hash);
  if (replayTransaction?.data !== transaction.data) throw new Error('Replay calldata differs');
  const untampered = validateTamperLinkage(
    transaction.data,
    tamperedTransaction.data,
    original.proofArguments
  );
  const result = await rpc.call({
    to: transaction.to,
    from: tamperedTransaction.from,
    data: untampered,
    gasLimit: 5000000n,
    blockTag: tamper.receipt.blockNumber - 1,
  });
  if (proofInterface.decodeFunctionResult('verifyLockAndOpenLine', result)[0] !== true)
    throw new Error('Historical original proof was not valid');
  const decoded = proofInterface.decodeFunctionData('verifyLockAndOpenLine', transaction.data);
  const proofArguments = [
    Number(decoded[0]),
    Number(decoded[1]),
    decoded[2],
    decoded[3],
    decoded[4].map((entry) => ({ hash: entry.hash, isLeft: entry.isLeft })),
    decoded[5],
    [...decoded[6]],
  ];
  const get = async (path) => {
    const response = await fetch(api + path, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Public evidence unavailable');
    return response.json();
  };
  const [job, junk, ready, stats] = await Promise.all([
    get('/api/jobs/bd5fdaf1-8a8f-4334-ae1f-6a5916080f28'),
    get('/api/jobs/f41b50b0-f121-4cfb-9ec2-3dac4d8e603b'),
    get('/ready'),
    get('/api/stats'),
  ]);
  if (
    job.status !== 'executed' ||
    job.evidence.creditcoinTxHash !== execution.hash ||
    junk.status !== 'refused' ||
    junk.errorCode !== 'WRONG_SOURCE_CONTRACT'
  )
    throw new Error('Actual job evidence mismatch');
  const pool = new Contract(
    destination.contracts.CreditPool,
    [
      'function lines(bytes32) view returns(address,uint256,uint256,uint64,uint256,uint64,bytes32)',
      'function borrowerProfiles(address) view returns(uint256,uint256,uint256,uint256,uint256)',
    ],
    rpc
  );
  const fixture = {
    schemaVersion: 1,
    kind: 'successful-native-execution',
    commitSha: original.commitSha,
    workerCommit: ready.version,
    acquiredAt: job.evidence.proofGeneratedAt,
    sourceTransaction: original.sourceTransaction,
    borrower: original.borrower,
    sourceVault: original.sourceVault,
    sourceToken: original.sourceToken,
    lockFact: original.lockFact,
    expectedCreditLimit: original.expectedCreditLimit,
    sourceReceipt: original.sourceReceipt,
    queryId: original.queryId,
    txIndex: original.txIndex,
    proofArguments,
    destinationTransaction: transaction.toJSON(),
    destinationReceipt: receipt.toJSON(),
    originalTamperFixture: 'fixtures/proofs/sepolia-lock-2026-09-05.json',
  };
  const evidence = {
    schemaVersion: 1,
    acceptanceStatus: 'native-origination-verified-draw-and-maturity-pending',
    checkedAt: new Date().toISOString(),
    deploymentCommit: original.commitSha,
    workerCommit: ready.version,
    job,
    junk,
    ready,
    stats,
    proof: { hash: execution.hash, receipt: receipt.toJSON(), confirmedAt: execution.timestamp },
    queryReplay: {
      hash: replay.hash,
      receipt: replay.receipt,
      confirmedAt: replay.confirmedAt,
      expectedError: replay.expectedError,
      revertData: replay.reason,
      before: replay.before,
      after: replay.after,
    },
    tamperCounterpartHistoricalNativeVerification: true,
    line: await pool.lines(original.lockFact.lockId),
    profile: await pool.borrowerProfiles(original.borrower),
    pending: [
      'borrower-signed-draw',
      'post-maturity-repayment',
      'complete-hosted-wallet-flow',
      'public-videos',
    ],
  };
  await writeFile('fixtures/proofs/creditcoin-executed-2026-09-05.json', stringify(fixture) + '\n', {
    flag: 'wx',
  });
  await writeFile('evidence/native-origination-2026-09-05.json', stringify(evidence) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      exported: true,
      proof: execution.hash,
      replay: replay.hash,
      lineMaturity: new Date(Number(evidence.line[3]) * 1000).toISOString(),
      originalContinuity: original.proofArguments[6].length,
      executedContinuity: proofArguments[6].length,
    })
  );
} finally {
  rpc.destroy();
}
