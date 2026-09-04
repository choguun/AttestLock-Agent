import { Contract, JsonRpcProvider, ZeroAddress, formatUnits, getAddress, isHexString } from 'ethers';

const required = [
  'SOURCE_CHAIN_RPC_URL',
  'CREDITCOIN_RPC_URL',
  'SOURCE_TOKEN_ADDRESS',
  'SOURCE_VAULT_ADDRESS',
  'MOCK_USD_ADDRESS',
  'CREDIT_POOL_ADDRESS',
  'ATTESTLOCK_ASC_ADDRESS',
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}.`);
}

const source = new JsonRpcProvider(process.env.SOURCE_CHAIN_RPC_URL);
const destination = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
const addresses = Object.fromEntries(required.slice(2).map((key) => [key, getAddress(process.env[key])]));
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
  ['function collateralToken() view returns (address)'],
  source
);
const pool = new Contract(
  addresses.CREDIT_POOL_ADDRESS,
  [
    'function asset() view returns (address)',
    'function asc() view returns (address)',
    'function lines(bytes32) view returns (address,uint256,uint256,uint64,uint256,uint64,bytes32)',
    'function borrowerProfiles(address) view returns (uint256,uint256,uint256,uint256,uint256)',
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

const evidence = {
  checkedAt: new Date().toISOString(),
  chains: { source: Number(sourceNetwork.chainId), destination: Number(destinationNetwork.chainId) },
  addresses,
  bindings,
  poolLiquidity: formatUnits(await asset.balanceOf(addresses.CREDIT_POOL_ADDRESS), 6),
};

const lockId = process.env.LOCK_ID;
if (lockId) {
  if (!isHexString(lockId, 32)) throw new Error('LOCK_ID must be 32 bytes.');
  const line = await pool.lines(lockId);
  if (line[0] === ZeroAddress) throw new Error('LOCK_ID has no credit line.');
  const profile = await pool.borrowerProfiles(line[0]);
  evidence.lock = {
    lockId,
    used: await asc.usedLocks(lockId),
    borrower: getAddress(line[0]),
    limit: formatUnits(line[1], 6),
    debt: formatUnits(line[2], 6),
    maturity: Number(line[3]),
    collateralAmount: formatUnits(line[4], 6),
    collateralUnlockAt: Number(line[5]),
    queryId: line[6],
  };
  evidence.profile = {
    lineCount: Number(profile[0]),
    totalCreditOpened: formatUnits(profile[1], 6),
    totalBorrowed: formatUnits(profile[2], 6),
    totalRepaid: formatUnits(profile[3], 6),
    outstandingDebt: formatUnits(profile[4], 6),
  };
}

const queryId = process.env.QUERY_ID ?? evidence.lock?.queryId;
if (queryId) evidence.queryProcessed = await asc.processedQueries(queryId);
console.log(JSON.stringify(evidence, null, 2));
