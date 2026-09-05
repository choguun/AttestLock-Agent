export const journalActions = [
  'faucet',
  'approve',
  'lock',
  'queue',
  'borrow',
  'repay_approve',
  'repay',
] as const;

export type JournalAction = (typeof journalActions)[number];
export type JournalStatus = 'pending' | 'confirmed' | 'failed';

export interface TransactionIdentity {
  nonce: number;
  to: string | null;
  data: string;
  value: string;
}

export interface JournalEntry {
  key: string;
  wallet: string;
  chainId: number;
  action: JournalAction;
  txHash: string;
  lockId?: string;
  status: JournalStatus;
  createdAt: string;
  updatedAt: string;
  identity?: TransactionIdentity;
}

const STORAGE_KEY = 'attestlock.transaction-journal.v1';
const MAX_ENTRIES = 50;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(): JournalEntry[] {
  try {
    const value = storage()?.getItem(STORAGE_KEY);
    if (!value) return [];
    const entries = JSON.parse(value) as JournalEntry[];
    return Array.isArray(entries)
      ? entries.filter(
          (entry) =>
            entry &&
            typeof entry.key === 'string' &&
            /^0x[0-9a-f]{40}$/i.test(entry.wallet) &&
            /^0x[0-9a-f]{64}$/i.test(entry.txHash) &&
            Number.isSafeInteger(entry.chainId) &&
            journalActions.includes(entry.action) &&
            ['pending', 'confirmed', 'failed'].includes(entry.status) &&
            Number.isFinite(Date.parse(entry.createdAt)) &&
            Number.isFinite(Date.parse(entry.updatedAt))
        )
      : [];
  } catch {
    return [];
  }
}

function write(entries: JournalEntry[]): void {
  const destination = storage();
  if (!destination)
    throw new Error('Local transaction storage is unavailable. Enable storage before sending transactions.');
  // Never evict pending work; it controls duplicate-send protection after refresh.
  const pending = entries.filter((entry) => entry.status === 'pending');
  const completed = entries.filter((entry) => entry.status !== 'pending').slice(0, MAX_ENTRIES);
  destination.setItem(STORAGE_KEY, JSON.stringify([...pending, ...completed]));
}

export function assertJournalAvailable(): void {
  const destination = storage();
  if (!destination) throw new Error('Local transaction storage is unavailable.');
  destination.setItem(`${STORAGE_KEY}.probe`, '1');
  destination.removeItem(`${STORAGE_KEY}.probe`);
}

function entryKey(wallet: string, chainId: number, action: JournalAction, txHash: string): string {
  return `${wallet.toLowerCase()}:${chainId}:${action}:${txHash.toLowerCase()}`;
}

export function recordTransaction(
  wallet: string,
  chainId: number,
  action: JournalAction,
  txHash: string,
  lockId?: string,
  identity?: TransactionIdentity
): JournalEntry {
  const now = new Date().toISOString();
  const key = entryKey(wallet, chainId, action, txHash);
  const existing = read().find((entry) => entry.key === key);
  const entry: JournalEntry = {
    key,
    wallet: wallet.toLowerCase(),
    chainId,
    action,
    txHash: txHash.toLowerCase(),
    lockId: lockId ?? existing?.lockId,
    status: existing?.status ?? 'pending',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    identity: identity ?? existing?.identity,
  };
  write([entry, ...read().filter((candidate) => candidate.key !== key)]);
  return entry;
}

export function updateTransaction(entry: JournalEntry, status: JournalStatus, lockId?: string): JournalEntry {
  const updated = { ...entry, status, lockId: lockId ?? entry.lockId, updatedAt: new Date().toISOString() };
  write([updated, ...read().filter((candidate) => candidate.key !== entry.key)]);
  return updated;
}

export function walletTransactions(wallet: string): JournalEntry[] {
  return read().filter((entry) => entry.wallet === wallet.toLowerCase());
}

export function resolveReplacement(
  entry: JournalEntry,
  replacement: { hash: string; from: string; nonce: number; to: string | null; data: string; value: bigint },
  receipt: { status: number | null; hash: string }
): JournalEntry | null {
  if (
    !entry.identity ||
    entry.action === 'queue' ||
    replacement.hash.toLowerCase() !== receipt.hash.toLowerCase() ||
    replacement.from.toLowerCase() !== entry.wallet ||
    replacement.nonce !== entry.identity.nonce ||
    replacement.hash.toLowerCase() === entry.txHash
  )
    throw new Error('Replacement does not match this wallet and nonce.');
  const sameAction =
    replacement.to?.toLowerCase() === entry.identity.to?.toLowerCase() &&
    replacement.data.toLowerCase() === entry.identity.data.toLowerCase() &&
    replacement.value.toString() === entry.identity.value;
  // A confirmed same-nonce transaction consumes the original nonce. Never infer
  // that different calldata performed the intended lock, borrow, or repayment.
  if (receipt.status !== 0 && receipt.status !== 1) throw new Error('Replacement is not confirmed.');
  updateTransaction(entry, 'failed');
  if (!sameAction || receipt.status !== 1) return null;
  return recordTransaction(
    entry.wallet,
    entry.chainId,
    entry.action,
    replacement.hash,
    entry.lockId,
    entry.identity
  );
}

export function clearTransactionJournal(): void {
  storage()?.removeItem(STORAGE_KEY);
}
