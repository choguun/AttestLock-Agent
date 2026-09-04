import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { JsonRpcProvider, getAddress, keccak256 } from 'ethers';

const networks = {
  sepolia: {
    chainId: 11_155_111,
    label: 'Sepolia',
    contracts: ['MockUSDC', 'LockVault'],
    explorer: 'https://sepolia.etherscan.io',
    dependencies: { openzeppelin: '5.4.0' },
  },
  'creditcoin-testnet': {
    chainId: 102_031,
    label: 'Creditcoin Testnet',
    contracts: ['MockUSD', 'CreditPool', 'AttestLockASC'],
    explorer: 'https://creditcoin-testnet.blockscout.com',
    dependencies: { ascContracts: '0.2.1', openzeppelin: '5.4.0' },
  },
};

const networkKey = process.env.DEPLOYMENT_NETWORK;
const broadcastFile = process.env.BROADCAST_FILE;
const outputFile = process.env.OUTPUT_FILE;
const rpcUrl = process.env.DEPLOYMENT_RPC_URL;
if (!networkKey || !broadcastFile || !outputFile || !rpcUrl) {
  throw new Error('Set DEPLOYMENT_NETWORK, BROADCAST_FILE, OUTPUT_FILE, and DEPLOYMENT_RPC_URL.');
}
const network = networks[networkKey];
if (!network) throw new Error(`Unsupported deployment network: ${networkKey}`);

const broadcast = JSON.parse(await readFile(broadcastFile, 'utf8'));
const creates = broadcast.transactions.filter(
  (entry) => entry.transactionType === 'CREATE' && entry.contractName && entry.contractAddress
);
const receiptsByHash = new Map(
  broadcast.receipts.map((receipt) => [String(receipt.transactionHash).toLowerCase(), receipt])
);
const provider = new JsonRpcProvider(rpcUrl);
const chain = await provider.getNetwork();
if (Number(chain.chainId) !== network.chainId) {
  throw new Error(`RPC chain ${chain.chainId} does not match expected ${network.chainId}.`);
}

const contracts = {};
const transactions = {};
const explorerUrls = {};
const codeHashes = {};
const constructorArguments = {};
const contractRecords = {};
const blocks = [];
async function verificationStatus(address) {
  let endpoint;
  if (networkKey === 'creditcoin-testnet') {
    endpoint = new URL('/api', network.explorer);
    endpoint.search = new URLSearchParams({
      module: 'contract',
      action: 'getsourcecode',
      address,
    }).toString();
  } else if (process.env.ETHERSCAN_API_KEY) {
    endpoint = new URL('https://api.etherscan.io/v2/api');
    endpoint.search = new URLSearchParams({
      chainid: String(network.chainId),
      module: 'contract',
      action: 'getsourcecode',
      address,
      apikey: process.env.ETHERSCAN_API_KEY,
    }).toString();
  } else {
    return 'not-checked';
  }
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    return response.ok && body.status === '1' && body.result?.[0]?.SourceCode ? 'verified' : 'unverified';
  } catch {
    return 'check-failed';
  }
}

for (const name of network.contracts) {
  const creation = creates.find((entry) => entry.contractName === name);
  if (!creation) throw new Error(`Broadcast is missing ${name}.`);
  const address = getAddress(creation.contractAddress);
  const hash = creation.hash;
  const receipt = receiptsByHash.get(hash.toLowerCase());
  if (!receipt || Number(receipt.status) !== 1) throw new Error(`${name} deployment did not succeed.`);
  const block = Number(receipt.blockNumber);
  const code = await provider.getCode(address, block);
  if (code === '0x') throw new Error(`${name} has no bytecode at deployment block ${block}.`);
  contracts[name] = address;
  transactions[name] = hash;
  explorerUrls[name] = `${network.explorer}/address/${address}`;
  explorerUrls[`${name}Transaction`] = `${network.explorer}/tx/${hash}`;
  codeHashes[name] = keccak256(code);
  constructorArguments[name] = creation.arguments ?? [];
  const deployedBlock = await provider.getBlock(block);
  if (!deployedBlock) throw new Error(`${name} deployment block ${block} is unavailable.`);
  const status = await verificationStatus(address);
  if (process.env.REQUIRE_VERIFIED === 'true' && status !== 'verified') {
    throw new Error(`${name} is not verified on ${network.label}; observed status: ${status}.`);
  }
  contractRecords[name] = {
    address,
    constructorArguments: creation.arguments ?? [],
    deploymentTransaction: hash,
    deploymentBlock: block,
    deployedAt: new Date(deployedBlock.timestamp * 1000).toISOString(),
    runtimeCodeHash: codeHashes[name],
    verificationStatus: status,
    explorerAddressUrl: explorerUrls[name],
    explorerTransactionUrl: explorerUrls[`${name}Transaction`],
  };
  blocks.push(block);
}

const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const deploymentBlock = Math.min(...blocks);
const block = await provider.getBlock(deploymentBlock);
if (!block) throw new Error(`Deployment block ${deploymentBlock} is unavailable.`);
const manifest = {
  chainId: network.chainId,
  network: network.label,
  deployedAt: new Date(block.timestamp * 1000).toISOString(),
  generatedAt: new Date().toISOString(),
  commitSha,
  solcVersion: '0.8.28',
  dependencies: network.dependencies,
  deploymentBlock,
  deployer: getAddress(creates[0].transaction.from),
  contracts,
  contractRecords,
  constructorArguments,
  codeHashes,
  transactions,
  explorerUrls,
};

if (networkKey === 'creditcoin-testnet') {
  if (!process.env.SOURCE_VAULT_ADDRESS || !process.env.SOURCE_TOKEN_ADDRESS) {
    throw new Error('Creditcoin manifest requires SOURCE_VAULT_ADDRESS and SOURCE_TOKEN_ADDRESS.');
  }
  manifest.sourceBindings = {
    chainKey: 1,
    LockVault: getAddress(process.env.SOURCE_VAULT_ADDRESS),
    MockUSDC: getAddress(process.env.SOURCE_TOKEN_ADDRESS),
  };
}

await writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(`Wrote sanitized ${network.label} manifest to ${outputFile}.`);
