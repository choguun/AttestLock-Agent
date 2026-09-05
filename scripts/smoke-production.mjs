import { chainInfo } from '@gluwa/usc-sdk';
import { Contract, getAddress, isHexString, JsonRpcProvider, ZeroAddress } from 'ethers';

const required = [
  'WEB_URL',
  'WORKER_URL',
  'SOURCE_CHAIN_RPC_URL',
  'CREDITCOIN_RPC_URL',
  'SOURCE_TOKEN_ADDRESS',
  'SOURCE_VAULT_ADDRESS',
  'MOCK_USD_ADDRESS',
  'CREDIT_POOL_ADDRESS',
  'ATTESTLOCK_ASC_ADDRESS',
  'RELAYER_ADDRESS',
  'INVALID_SOURCE_TX_HASH',
  'EXPECTED_COMMIT_SHA',
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}
if (
  !isHexString(process.env.INVALID_SOURCE_TX_HASH, 32) ||
  BigInt(process.env.INVALID_SOURCE_TX_HASH) === 0n
) {
  throw new Error('INVALID_SOURCE_TX_HASH must be a nonzero 32-byte transaction hash');
}

const webUrl = new URL(process.env.WEB_URL);
const workerUrl = new URL(process.env.WORKER_URL);
const [web, health, ready, stats, cors] = await Promise.all([
  fetch(webUrl),
  fetch(new URL('/health', workerUrl)),
  fetch(new URL('/ready', workerUrl)),
  fetch(new URL('/api/stats', workerUrl)),
  fetch(new URL('/api/challenges', workerUrl), {
    method: 'OPTIONS',
    headers: {
      Origin: webUrl.origin,
      'Access-Control-Request-Method': 'POST',
    },
  }),
]);
if (!web.ok || !health.ok || !ready.ok || !stats.ok || !cors.ok) {
  throw new Error('Hosted web, worker health/readiness/stats, or CORS preflight failed');
}
if (cors.headers.get('access-control-allow-origin') !== webUrl.origin) {
  throw new Error('Worker CORS does not allow the production web origin');
}

const html = await web.text();
const readiness = await ready.json();
if (
  readiness.schemaVersion !== 2 ||
  readiness.status !== 'ready' ||
  readiness.version !== process.env.EXPECTED_COMMIT_SHA ||
  !readiness.checks ||
  Object.values(readiness.checks).some((value) => value !== true) ||
  !Number.isSafeInteger(readiness.latestAttestedHeight) ||
  readiness.latestAttestedHeight <= 0 ||
  !readiness.attestationAdvancedAt ||
  !Number.isSafeInteger(readiness.proofBuilderAttestedHeight) ||
  readiness.proofBuilderAttestedHeight <= 0
) {
  throw new Error('Worker readiness is incomplete or lacks an active attestation height');
}
const publicStats = await stats.json();
if (
  publicStats.protocolStatus !== 'current' ||
  !publicStats.protocolObservedAt ||
  !Number.isSafeInteger(publicStats.asOfBlock)
)
  throw new Error('Protocol statistics are stale or unavailable.');
for (const key of [
  'totalJobs',
  'uniqueWallets',
  'executedJobs',
  'refusedJobs',
  'failedJobs',
  'linesOpened',
  'borrowersWhoDrew',
]) {
  if (!Number.isSafeInteger(publicStats[key]) || publicStats[key] < 0) {
    throw new Error(`Public aggregate statistic is invalid: ${key}`);
  }
}
for (const key of [
  'totalCreditOpenedAtomic',
  'totalBorrowedAtomic',
  'totalRepaidAtomic',
  'outstandingDebtAtomic',
]) {
  if (typeof publicStats[key] !== 'string' || !/^\d+$/.test(publicStats[key])) {
    throw new Error(`Public aggregate atomic amount is invalid: ${key}`);
  }
}
if (JSON.stringify(publicStats).includes('0x')) {
  throw new Error('Public aggregate statistics must not expose wallet or transaction identifiers');
}
const assetUrls = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => url.includes('/assets/'));
const bundle = (
  await Promise.all(assetUrls.map(async (url) => (await fetch(new URL(url, webUrl))).text()))
).join('\n');
for (const value of [
  workerUrl.origin,
  process.env.SOURCE_TOKEN_ADDRESS,
  process.env.SOURCE_VAULT_ADDRESS,
  process.env.MOCK_USD_ADDRESS,
  process.env.CREDIT_POOL_ADDRESS,
  process.env.ATTESTLOCK_ASC_ADDRESS,
  process.env.INVALID_SOURCE_TX_HASH,
]) {
  if (!bundle.toLowerCase().includes(value.toLowerCase())) {
    throw new Error(`Production web bundle is missing expected configuration: ${value}`);
  }
}

const source = new JsonRpcProvider(process.env.SOURCE_CHAIN_RPC_URL);
const creditcoin = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
const [sourceNetwork, creditcoinNetwork] = await Promise.all([source.getNetwork(), creditcoin.getNetwork()]);
if (sourceNetwork.chainId !== 11_155_111n) throw new Error('Source RPC is not Sepolia');
if (creditcoinNetwork.chainId !== 102_031n) throw new Error('Destination RPC is not Creditcoin testnet');
const invalidSourceTransaction = await source.getTransaction(process.env.INVALID_SOURCE_TX_HASH);
if (!invalidSourceTransaction) throw new Error('Configured refusal transaction does not exist on Sepolia');
if (
  invalidSourceTransaction.to &&
  getAddress(invalidSourceTransaction.to) === getAddress(process.env.SOURCE_VAULT_ADDRESS)
) {
  throw new Error('Configured refusal transaction must not target LockVault');
}

for (const key of ['SOURCE_TOKEN_ADDRESS', 'SOURCE_VAULT_ADDRESS']) {
  const address = getAddress(process.env[key]);
  if ((await source.getCode(address)) === '0x') throw new Error(`${key} has no Sepolia bytecode`);
}
for (const key of ['MOCK_USD_ADDRESS', 'CREDIT_POOL_ADDRESS', 'ATTESTLOCK_ASC_ADDRESS']) {
  const address = getAddress(process.env[key]);
  if ((await creditcoin.getCode(address)) === '0x') throw new Error(`${key} has no Creditcoin bytecode`);
}

const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoin);
const [registered, latest, relayerBalance] = await Promise.all([
  chainInfoProvider.getSupportedChainByKey(1),
  chainInfoProvider.getLatestAttestedHeightAndHash(1),
  creditcoin.getBalance(getAddress(process.env.RELAYER_ADDRESS)),
]);
if (!registered || registered.chainKey !== 1 || registered.chainId !== 11_155_111) {
  throw new Error('Creditcoin ChainInfo does not bind chainKey 1 to Sepolia');
}
if (!latest.exists || latest.height <= 0 || latest.height < readiness.latestAttestedHeight) {
  throw new Error('Creditcoin has no active Sepolia attestation at the worker-reported height');
}
const minimumRelayerBalance = BigInt(process.env.MIN_RELAYER_BALANCE_WEI ?? '10000000000000000');
if (relayerBalance < minimumRelayerBalance) throw new Error('Relayer is below the configured funding floor');

const vault = new Contract(
  getAddress(process.env.SOURCE_VAULT_ADDRESS),
  ['function collateralToken() view returns (address)'],
  source
);
const pool = new Contract(
  getAddress(process.env.CREDIT_POOL_ADDRESS),
  ['function asset() view returns (address)', 'function asc() view returns (address)'],
  creditcoin
);
const asc = new Contract(
  getAddress(process.env.ATTESTLOCK_ASC_ADDRESS),
  [
    'function verifier() view returns (address)',
    'function pool() view returns (address)',
    'function sourceVault() view returns (address)',
    'function sourceToken() view returns (address)',
  ],
  creditcoin
);
const bindings = [
  [await vault.collateralToken(), process.env.SOURCE_TOKEN_ADDRESS],
  [await pool.asset(), process.env.MOCK_USD_ADDRESS],
  [await pool.asc(), process.env.ATTESTLOCK_ASC_ADDRESS],
  [await asc.verifier(), '0x0000000000000000000000000000000000000FD2'],
  [await asc.pool(), process.env.CREDIT_POOL_ADDRESS],
  [await asc.sourceVault(), process.env.SOURCE_VAULT_ADDRESS],
  [await asc.sourceToken(), process.env.SOURCE_TOKEN_ADDRESS],
];
for (const [actual, expected] of bindings) {
  if (getAddress(actual) === ZeroAddress || getAddress(actual) !== getAddress(expected)) {
    throw new Error('A deployed immutable or one-time contract binding is incorrect');
  }
}

console.log(
  JSON.stringify({
    status: 'passed',
    checkedAt: new Date().toISOString(),
    version: readiness.version,
    latestAttestedHeight: latest.height,
    publicStats,
  })
);
