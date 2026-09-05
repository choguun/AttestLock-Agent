import { Wallet, getAddress } from 'ethers';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const roles = ['deployer', 'relayer', 'borrower'];
const directory = join(homedir(), '.foundry', 'keystores');
const bridge = join(dirname(fileURLToPath(import.meta.url)), 'testnet-keychain.py');
function keychain(operation, role, password) {
  if (process.platform !== 'darwin' || !roles.includes(role))
    throw new Error('Dedicated macOS testnet accounts only.');
  return execFileSync('python3', [bridge], {
    input: JSON.stringify({ operation, role, password }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
export const keystorePath = (role) => {
  if (!roles.includes(role)) throw new Error('Unknown testnet role.');
  return join(directory, `attestlock-2026-${role}.json`);
};
export async function loadTestnetWallet(role) {
  const encrypted = await readFile(keystorePath(role), 'utf8');
  return Wallet.fromEncryptedJson(encrypted, keychain('get', role));
}
async function createAccounts() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const result = {};
  for (const role of roles) {
    const path = keystorePath(role);
    let existing;
    try {
      existing = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existing) {
      result[role] = { address: getAddress(`0x${existing.address}`), keystore: path, created: false };
      continue;
    }
    const wallet = Wallet.createRandom();
    const password = randomBytes(32).toString('base64url');
    const encrypted = await wallet.encrypt(password);
    keychain('add', role, password);
    await writeFile(path, encrypted, { flag: 'wx', mode: 0o600 });
    result[role] = { address: wallet.address, keystore: path, created: true };
  }
  console.log(JSON.stringify(result, null, 2)); // Public addresses and encrypted paths only.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createAccounts().catch(() => {
    console.error(
      'Account setup did not complete. Inspect the dedicated Keychain entries and keystore paths locally; no credentials were printed.'
    );
    process.exitCode = 1;
  });
}
