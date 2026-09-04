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
  const value = storage()?.getItem(STORAGE_KEY);
  if (!value) return [];
  try {
    const entries = JSON.parse(value) as JournalEntry[];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function write(entries: JournalEntry[]): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

function entryKey(wallet: string, chainId: number, action: JournalAction, txHash: string): string {
  return `${wallet.toLowerCase()}:${chainId}:${action}:${txHash.toLowerCase()}`;
}

export function recordTransaction(
  wallet: string,
  chainId: number,
  action: JournalAction,
  txHash: string,
  lockId?: string
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

export function clearTransactionJournal(): void {
  storage()?.removeItem(STORAGE_KEY);
}
