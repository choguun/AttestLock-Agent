import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Dedicated local journals are ignored. Only the allowlisted public evidence below is published.
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const source = await read('.tmp/source-demo.json');
const proof = await read('.tmp/real-proof.json');
const negative = await read('.tmp/tampered-proof.json');
const funding = await read('.tmp/funding.json');
async function create(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  console.log(`Exported public evidence: ${path}`);
}
if (!proof.queryId || !negative.receipt || negative.receipt.status !== 0 || negative.after.processedQuery)
  throw new Error('Unused-query negative evidence is incomplete.');
await create('fixtures/proofs/sepolia-lock-2026-09-05.json', proof);
await create('evidence/testnet-origination-inputs-2026-09-05.json', {
  schemaVersion: 1,
  acceptanceStatus: 'partial-inputs-and-tamper-only',
  exportedAt: new Date().toISOString(),
  deploymentCommit: source.commitSha,
  source: {
    chainId: source.chainId,
    borrower: source.borrower,
    token: source.token,
    vault: source.vault,
    lockId: source.lockId,
    collateralAmountAtomic: source.collateralAmountAtomic,
    unlockAt: source.unlockAt,
    actions: Object.fromEntries(
      Object.entries(source.actions).map(([action, entry]) => [
        action,
        {
          hash: entry.hash,
          receipt: entry.receipt,
          confirmedAt: entry.confirmedAt,
        },
      ])
    ),
  },
  // Funding journal contains only public receipts/addresses, never signing material.
  funding,
  tamperedProof: {
    hash: negative.hash,
    queryId: negative.queryId,
    expectedError: negative.expectedError,
    revertData: negative.selector,
    receipt: negative.receipt,
    confirmedAt: negative.confirmedAt,
    beforeBlock: negative.beforeBlock,
    before: negative.before,
    after: negative.after,
  },
  pending: [
    'hosted-valid-proof',
    'borrower-draw',
    'query-replay',
    'junk-job',
    'post-maturity-repayment',
    'hosted-browser-flow',
    'public-videos',
  ],
});
