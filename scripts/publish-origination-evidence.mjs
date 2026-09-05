import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Contract, Interface, JsonRpcProvider } from 'ethers';
import { proofInterface, validateTamperLinkage } from './proof-linkage.mjs';
import { isExpectedProofRevert } from './proof-revert.mjs';
import { collectBorrowEvidence } from './borrow-evidence.mjs';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const [input, native, fixture, original, deployment] = await Promise.all([
  read('evidence/testnet-origination-inputs-2026-09-05.json'),
  read('evidence/native-origination-2026-09-05.json'),
  read('fixtures/proofs/creditcoin-executed-2026-09-05.json'),
  read('fixtures/proofs/sepolia-lock-2026-09-05.json'),
  read('deployments/creditcoin-testnet.json'),
]);
const source = new JsonRpcProvider(
  process.env.SOURCE_CHAIN_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
);
const destination = new JsonRpcProvider(
  process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network'
);
const addresses = deployment.contracts;
const pool = new Contract(
  addresses.CreditPool,
  [
    'function lines(bytes32) view returns(address,uint256,uint256,uint64,uint256,uint64,bytes32)',
    'function borrowerProfiles(address) view returns(uint256,uint256,uint256,uint256,uint256)',
  ],
  destination
);
const asc = new Contract(
  addresses.AttestLockASC,
  [
    'function usedLocks(bytes32) view returns(bool)',
    'function processedQueries(bytes32) view returns(bool)',
    'event LockVerifiedAndLineOpened(bytes32 indexed queryId,bytes32 indexed lockId,address indexed borrower,uint256 collateralAmount,uint256 creditLimit,uint64 maturity,uint64 collateralUnlockAt)',
  ],
  destination
);
const asset = new Contract(
  addresses.MockUSD,
  ['function balanceOf(address) view returns(uint256)'],
  destination
);
const stringify = (value) =>
  JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item));
const lockId = fixture.lockFact.lockId;
async function snapshot(blockTag) {
  const options = { blockTag };
  return stringify(
    await Promise.all([
      pool.lines(lockId, options),
      pool.borrowerProfiles(fixture.borrower, options),
      asc.usedLocks(lockId, options),
      asc.processedQueries(fixture.queryId, options),
      asset.balanceOf(addresses.CreditPool, options),
      asset.balanceOf(fixture.borrower, options),
    ])
  );
}
try {
  if (
    (await source.getNetwork()).chainId !== 11155111n ||
    (await destination.getNetwork()).chainId !== 102031n
  )
    throw new Error('Wrong network');
  const specs = [
    ['lock', source, input.source.actions.lock.hash, 1],
    ['proof', destination, native.proof.hash, 1],
    ['junk', source, native.junk.txHash, 1],
    ['tamperedProof', destination, input.tamperedProof.hash, 0],
    ['duplicateQuery', destination, native.queryReplay.hash, 0],
  ];
  const receipts = {};
  const transactions = {};
  for (const [name, rpc, hash, status] of specs) {
    const [receipt, transaction] = await Promise.all([
      rpc.getTransactionReceipt(hash),
      rpc.getTransaction(hash),
    ]);
    if (!receipt || !transaction || receipt.status !== status) throw new Error(`Invalid ${name} receipt`);
    receipts[name] = receipt;
    transactions[name] = transaction;
  }
  const expectedCalldata = proofInterface.encodeFunctionData('verifyLockAndOpenLine', fixture.proofArguments);
  if (
    transactions.proof.data !== expectedCalldata ||
    transactions.duplicateQuery.data !== expectedCalldata ||
    transactions.proof.to.toLowerCase() !== addresses.AttestLockASC.toLowerCase() ||
    transactions.proof.from.toLowerCase() !== '0xed699a3fde6c3552f312fad2b38208b22186ef01'
  )
    throw new Error('Native proof/replay identity mismatch');
  if (
    transactions.lock.from.toLowerCase() !== fixture.borrower.toLowerCase() ||
    transactions.lock.to.toLowerCase() !== fixture.sourceVault.toLowerCase()
  )
    throw new Error('Source signer/vault mismatch');
  const untampered = validateTamperLinkage(
    expectedCalldata,
    transactions.tamperedProof.data,
    original.proofArguments
  );
  const beforeTamper = receipts.tamperedProof.blockNumber - 1;
  if (
    (await asc.processedQueries(fixture.queryId, { blockTag: beforeTamper })) ||
    receipts.tamperedProof.blockNumber >= receipts.proof.blockNumber ||
    receipts.duplicateQuery.blockNumber <= receipts.proof.blockNumber
  )
    throw new Error('Invalid negative ordering');
  const result = await destination.call({
    to: addresses.AttestLockASC,
    from: transactions.tamperedProof.from,
    data: untampered,
    gasLimit: 5000000n,
    blockTag: beforeTamper,
  });
  if (!proofInterface.decodeFunctionResult('verifyLockAndOpenLine', result)[0])
    throw new Error('Original native proof rejected');
  for (const [name, error] of [
    ['tamperedProof', 'ProofVerificationFailed'],
    ['duplicateQuery', 'QueryAlreadyProcessed'],
  ]) {
    const tx = transactions[name],
      receipt = receipts[name];
    let revert;
    if (tx.to.toLowerCase() !== addresses.AttestLockASC.toLowerCase())
      throw new Error('Wrong negative target');
    try {
      await destination.call({
        from: tx.from,
        to: tx.to,
        data: tx.data,
        gasLimit: tx.gasLimit,
        blockTag: receipt.blockNumber - 1,
      });
    } catch (reason) {
      revert = reason.data ?? reason.info?.error?.data;
    }
    if (
      !isExpectedProofRevert(revert, error) ||
      (await snapshot(receipt.blockNumber - 1)) !== (await snapshot(receipt.blockNumber))
    )
      throw new Error(`Invalid ${name} reason/state`);
  }
  const events = receipts.proof.logs
    .filter((log) => log.address.toLowerCase() === addresses.AttestLockASC.toLowerCase())
    .map((log) => asc.interface.parseLog(log))
    .filter((event) => event?.name === 'LockVerifiedAndLineOpened');
  const block = await destination.getBlock(receipts.proof.blockNumber);
  const line = await pool.lines(lockId, { blockTag: receipts.proof.blockNumber });
  if (
    events.length !== 1 ||
    events[0].args.lockId !== lockId ||
    events[0].args.queryId !== fixture.queryId ||
    line[1] !== 50000000n ||
    line[4] !== 100000000n ||
    line[3] !== BigInt(block.timestamp + 604800) ||
    line[0].toLowerCase() !== fixture.borrower.toLowerCase()
  )
    throw new Error('Exact line/event mismatch');
  const sourceEventInterface = new Interface([
    'event CollateralLocked(bytes32 indexed lockId,address indexed borrower,address indexed token,uint256 amount,uint64 unlockAt)',
  ]);
  const lockEvent = receipts.lock.logs
    .filter((log) => log.address.toLowerCase() === fixture.sourceVault.toLowerCase())
    .map((log) => sourceEventInterface.parseLog(log))
    .find((event) => event?.name === 'CollateralLocked' && event.args.lockId === lockId);
  if (
    !lockEvent ||
    lockEvent.args.amount !== line[4] ||
    lockEvent.args.unlockAt !== line[5] ||
    lockEvent.args.token.toLowerCase() !== fixture.sourceToken.toLowerCase()
  )
    throw new Error('Source lock fact mismatch');
  const response = await fetch(
    `https://attestlock-worker-production.up.railway.app/api/jobs/${native.junk.id}`,
    { signal: AbortSignal.timeout(10000) }
  );
  const junk = await response.json();
  if (
    !response.ok ||
    junk.status !== 'refused' ||
    junk.errorCode !== 'WRONG_SOURCE_CONTRACT' ||
    junk.txHash !== transactions.junk.hash ||
    junk.evidence.creditcoinSubmissionTxHash ||
    transactions.junk.to?.toLowerCase() === fixture.sourceVault.toLowerCase()
  )
    throw new Error('No matching unfunded junk refusal');
  const draw = process.env.BORROW_TX_HASH
    ? await collectBorrowEvidence(destination, process.env.BORROW_TX_HASH, {
        borrower: fixture.borrower,
        pool: addresses.CreditPool,
        asset: addresses.MockUSD,
        asc: addresses.AttestLockASC,
        lockId,
        queryId: fixture.queryId,
        proofTimestamp: block.timestamp,
      })
    : null;
  if (draw) receipts.borrow = draw.receipt;
  const asOfBlock = draw?.block.number ?? receipts.proof.blockNumber;
  const profile = await pool.borrowerProfiles(fixture.borrower, { blockTag: asOfBlock });
  if (profile[2] - profile[3] !== profile[4]) throw new Error('Invalid profile accounting');
  const artifact = {
    schemaVersion: 1,
    acceptanceStage: draw ? 'borrow-demonstrated' : 'native-origination',
    checkedAt: new Date().toISOString(),
    asOfBlock,
    proofArguments: fixture.proofArguments,
    lock: {
      lockId,
      queryId: fixture.queryId,
      limitAtomic: line[1].toString(),
      collateralAmountAtomic: line[4].toString(),
      maturity: Number(line[3]),
      borrower: fixture.borrower,
      collateralUnlockAt: Number(line[5]),
    },
    profile: {
      lineCount: Number(profile[0]),
      totalCreditOpenedAtomic: profile[1].toString(),
      totalBorrowedAtomic: profile[2].toString(),
      totalRepaidAtomic: profile[3].toString(),
      outstandingDebtAtomic: profile[4].toString(),
    },
    transactions: Object.fromEntries(
      Object.entries(receipts).map(([name, r]) => [
        name,
        { hash: r.hash, blockNumber: r.blockNumber, status: r.status },
      ])
    ),
    invalidPathStateInvariant: true,
    queryProcessed: await asc.processedQueries(fixture.queryId),
  };
  await mkdir('apps/web/public/evidence', { recursive: true });
  if (draw) await writeFile('evidence/borrow-2026-09-05.json', JSON.stringify(draw, null, 2) + '\n');
  await writeFile('apps/web/public/evidence/verified.json', JSON.stringify(artifact, null, 2) + '\n');
  console.log(
    JSON.stringify({
      published: artifact.acceptanceStage,
      proof: native.proof.hash,
      postMaturityAcceptance: false,
    })
  );
} finally {
  source.destroy();
  destination.destroy();
}
