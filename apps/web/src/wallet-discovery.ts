import type { Eip1193Provider } from 'ethers';

export interface WalletChoice {
  id: string;
  name: string;
  rdns: string;
  provider: Eip1193Provider;
}

const providers = new Map<string, WalletChoice>();
const subscribers = new Set<() => void>();
const selectionKey = 'attestlock.wallet-provider.v1';
let started = false;

// EIP-6963 metadata is self-reported, not identity verification. Never render provider SVG/HTML.
export function walletChoices(): WalletChoice[] {
  if (providers.size) return [...providers.values()];
  return window.ethereum
    ? [{ id: 'legacy', rdns: 'legacy', name: 'Browser wallet (legacy)', provider: window.ethereum }]
    : [];
}

export function observeWallets(onChange: () => void): () => void {
  if (!started) {
    started = true;
    // Keep this listener for the page lifetime, including late announcements.
    window.addEventListener('eip6963:announceProvider', (event) => {
      const detail = (event as CustomEvent).detail;
      const info = detail?.info;
      if (
        !info ||
        typeof info.uuid !== 'string' ||
        !info.uuid ||
        info.uuid.length > 128 ||
        typeof info.name !== 'string' ||
        !info.name ||
        info.name.length > 100 ||
        typeof info.rdns !== 'string' ||
        !info.rdns ||
        info.rdns.length > 255 ||
        typeof detail.provider?.request !== 'function' ||
        providers.has(info.uuid) ||
        [...providers.values()].some((choice) => choice.provider === detail.provider)
      )
        return;
      providers.set(info.uuid, {
        id: info.uuid,
        name: info.name,
        rdns: info.rdns,
        provider: detail.provider,
      });
      subscribers.forEach((notify) => notify());
    });
  }
  subscribers.add(onChange);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  onChange();
  return () => {
    subscribers.delete(onChange);
  };
}

export function rememberWallet(choice: WalletChoice): void {
  try {
    localStorage.setItem(selectionKey, choice.rdns);
  } catch {
    /* Session remains usable. */
  }
}

export async function restorableWallet(): Promise<WalletChoice | null> {
  const unsubscribe = observeWallets(() => undefined);
  // Discovery requests no accounts or signatures. Allow async extension announcements.
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  unsubscribe();
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(selectionKey);
  } catch {
    /* No persisted selection. */
  }
  const choices = walletChoices();
  if (saved) {
    const matches = choices.filter((choice) => choice.rdns === saved);
    // Ambiguous or missing wallet: ask for selection, never silently fall back to another provider.
    return matches.length === 1 ? matches[0]! : null;
  }
  return choices.length === 1 ? choices[0]! : null;
}
