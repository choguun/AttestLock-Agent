import { getAddress, JsonRpcProvider } from 'ethers';

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
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const webUrl = new URL(process.env.WEB_URL);
const workerUrl = new URL(process.env.WORKER_URL);
const [web, health, ready, cors] = await Promise.all([
  fetch(webUrl),
  fetch(new URL('/health', workerUrl)),
  fetch(new URL('/ready', workerUrl)),
  fetch(new URL('/api/challenges', workerUrl), {
    method: 'OPTIONS',
    headers: {
      Origin: webUrl.origin,
      'Access-Control-Request-Method': 'POST',
    },
  }),
]);
if (!web.ok || !health.ok || !ready.ok || !cors.ok) {
  throw new Error('Hosted web, worker health/readiness, or CORS preflight failed');
}
if (cors.headers.get('access-control-allow-origin') !== webUrl.origin) {
  throw new Error('Worker CORS does not allow the production web origin');
}

const html = await web.text();
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

for (const key of ['SOURCE_TOKEN_ADDRESS', 'SOURCE_VAULT_ADDRESS']) {
  const address = getAddress(process.env[key]);
  if ((await source.getCode(address)) === '0x') throw new Error(`${key} has no Sepolia bytecode`);
}
for (const key of ['MOCK_USD_ADDRESS', 'CREDIT_POOL_ADDRESS', 'ATTESTLOCK_ASC_ADDRESS']) {
  const address = getAddress(process.env[key]);
  if ((await creditcoin.getCode(address)) === '0x') throw new Error(`${key} has no Creditcoin bytecode`);
}

console.log('Production smoke checks passed.');
