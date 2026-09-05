import { readFile, writeFile } from 'node:fs/promises';
import { Contract, Interface, FetchRequest, JsonRpcProvider, getAddress, keccak256 } from 'ethers';

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
const provenanceFile = process.env.PROVENANCE_FILE;
if (!networkKey || !broadcastFile || !outputFile || !rpcUrl || !provenanceFile) {
  throw new Error(
    'Set DEPLOYMENT_NETWORK, BROADCAST_FILE, OUTPUT_FILE, DEPLOYMENT_RPC_URL, and PROVENANCE_FILE.'
  );
}
const provenance = JSON.parse(await readFile(provenanceFile, 'utf8'));
if (
  provenance.schemaVersion !== 1 ||
  !/^[a-f0-9]{40}$/.test(provenance.commitSha) ||
  !provenance.ciRun ||
  !provenance.artifacts
)
  throw new Error('Invalid pre-deployment provenance.');
const network = networks[networkKey];
if (!network) throw new Error(`Unsupported deployment network: ${networkKey}`);

const broadcast = JSON.parse(await readFile(broadcastFile, 'utf8'));
const creates = broadcast.transactions.filter(
  (entry) => entry.transactionType === 'CREATE' && entry.contractName && entry.contractAddress
);
const receiptsByHash = new Map(
  broadcast.receipts.map((receipt) => [String(receipt.transactionHash).toLowerCase(), receipt])
);
const request = new FetchRequest(rpcUrl);
request.timeout = 15_000;
const provider = new JsonRpcProvider(request);
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
  const artifact = provenance.artifacts[name];
  const liveTransaction = await provider.getTransaction(hash);
  const liveReceipt = await provider.getTransactionReceipt(hash);
  if (
    !artifact ||
    !liveTransaction ||
    liveReceipt?.status !== 1 ||
    liveReceipt.blockNumber !== block ||
    liveReceipt.contractAddress?.toLowerCase() !== address.toLowerCase() ||
    !liveTransaction.data.toLowerCase().startsWith(artifact.creationBytecode.toLowerCase())
  )
    throw new Error(`${name} creation does not match the certified artifact and broadcast.`);
  const maskImmutables = (bytecode) => {
    const bytes = Buffer.from(bytecode.slice(2), 'hex');
    for (const references of Object.values(artifact.immutableReferences))
      for (const { start, length } of references) bytes.fill(0, start, start + length);
    return bytes.toString('hex');
  };
  if (maskImmutables(code) !== maskImmutables(artifact.runtimeBytecode))
    throw new Error(`${name} runtime does not match the certified artifact outside constructor immutables.`);
  const encodedArguments = new Interface(artifact.abi).encodeDeploy(creation.arguments ?? []);
  if (
    liveTransaction.data.toLowerCase() !==
    (artifact.creationBytecode + encodedArguments.slice(2)).toLowerCase()
  )
    throw new Error(`${name} constructor arguments do not match the actual creation calldata.`);
  contracts[name] = address;
  transactions[name] = hash;
  explorerUrls[name] = `${network.explorer}/address/${address}`;
  explorerUrls[`${name}Transaction`] = `${network.explorer}/tx/${hash}`;
  codeHashes[name] = keccak256(code);
  constructorArguments[name] = creation.arguments ?? [];
  const deployedBlock = await provider.getBlock(block);
  if (!deployedBlock) throw new Error(`${name} deployment block ${block} is unavailable.`);
  if (
    !Number.isFinite(Date.parse(provenance.preparedAt)) ||
    Date.parse(provenance.preparedAt) > deployedBlock.timestamp * 1000
  )
    throw new Error(`${name} provenance was not captured before deployment.`);
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
    artifactCreationCodeHash: artifact.creationCodeHash,
    compiler: artifact.compiler,
    compilerSettings: artifact.settings,
    verificationStatus: status,
    explorerAddressUrl: explorerUrls[name],
    explorerTransactionUrl: explorerUrls[`${name}Transaction`],
  };
  blocks.push(block);
}

const commitSha = provenance.commitSha;
const deploymentBlock = Math.min(...blocks);
const block = await provider.getBlock(deploymentBlock);
if (!block) throw new Error(`Deployment block ${deploymentBlock} is unavailable.`);
const manifest = {
  chainId: network.chainId,
  network: network.label,
  deployedAt: new Date(block.timestamp * 1000).toISOString(),
  generatedAt: new Date().toISOString(),
  commitSha,
  compilerProvenance: {
    preparedAt: provenance.preparedAt,
    ciRun: provenance.ciRun,
    foundryVersion: provenance.foundryVersion,
  },
  solcVersion: provenance.artifacts[network.contracts[0]].compiler.version,
  dependencies: provenance.dependencies,
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
  const asc = new Contract(contracts.AttestLockASC, provenance.artifacts.AttestLockASC.abi, provider);
  const pool = new Contract(contracts.CreditPool, provenance.artifacts.CreditPool.abi, provider);
  const asset = new Contract(contracts.MockUSD, provenance.artifacts.MockUSD.abi, provider);
  const checks = [
    [await asc.pool(), contracts.CreditPool],
    [await asc.sourceVault(), manifest.sourceBindings.LockVault],
    [await asc.sourceToken(), manifest.sourceBindings.MockUSDC],
    [await asc.verifier(), '0x0000000000000000000000000000000000000FD2'],
    [await pool.asc(), contracts.AttestLockASC],
    [await pool.asset(), contracts.MockUSD],
    [await pool.owner(), manifest.deployer],
    [await asset.owner(), manifest.deployer],
  ];
  if (checks.some(([actual, expected]) => getAddress(actual) !== getAddress(expected)))
    throw new Error('Destination constructor or one-time ASC bindings do not match.');
  const liquidity = await asset.balanceOf(contracts.CreditPool);
  if (liquidity < 50_000_000n) throw new Error('Pool liquidity is below one demo draw.');
  manifest.poolLiquidityAtomic = liquidity.toString();
} else {
  const vault = new Contract(contracts.LockVault, provenance.artifacts.LockVault.abi, provider);
  if (getAddress(await vault.collateralToken()) !== contracts.MockUSDC)
    throw new Error('Vault token binding does not match.');
}

await writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(`Wrote sanitized ${network.label} manifest to ${outputFile}.`);
