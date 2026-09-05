import { expect, it, vi } from 'vitest';
import { observeWallets, rememberWallet, restorableWallet, walletChoices } from './wallet-discovery';
import { connectWallet, restoreWallet, watchWallet, switchChain } from './wallet';

it('pins the chosen EIP-6963 provider for reads, listeners, switching and restoration', async () => {
  let chain = '0xaa36a7';
  let registered = false;
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_accounts' || method === 'eth_requestAccounts')
      return ['0x1111111111111111111111111111111111111111'];
    if (method === 'eth_chainId') return chain;
    if (method === 'wallet_switchEthereumChain') {
      if (!registered) throw Object.assign(new Error('Unknown chain'), { code: 4902 });
      chain = '0x18e8f';
      return null;
    }
    if (method === 'wallet_addEthereumChain') {
      registered = true;
      return null;
    }
    throw new Error('Unexpected method');
  });
  const provider = { request, on: vi.fn(), removeListener: vi.fn() };
  const wrong = {
    request: vi.fn(() => {
      throw new Error('Wrong wallet');
    }),
  };
  const stop = observeWallets(vi.fn());
  const announce = (uuid: string, rdns: string, p: unknown) =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: { info: { uuid, rdns, name: uuid }, provider: p },
      })
    );
  announce('rabby', 'io.rabby', provider);
  announce('other', 'io.other', wrong);
  announce('rabby', 'evil.overwrite', wrong);
  announce('invalid', 'io.invalid', {});
  expect(walletChoices()).toHaveLength(2);
  expect(await restorableWallet()).toBeNull();
  await expect(connectWallet()).rejects.toMatchObject({ code: 'WALLET_SELECTION' });
  const selected = walletChoices().find((w) => w.id === 'rabby')!;
  const session = await connectWallet(selected);
  const unsubscribe = watchWallet(vi.fn(), session);
  expect(provider.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  const switched = await switchChain(102031, session);
  expect(switched.wallet.provider).toBe(provider);
  expect(switched.chainId).toBe(102031);
  expect(request.mock.calls.some(([arg]) => arg.method === 'wallet_addEthereumChain')).toBe(true);
  const before = request.mock.calls.filter(([arg]) => arg.method === 'eth_requestAccounts').length;
  expect((await restoreWallet())?.wallet.provider).toBe(provider);
  expect(request.mock.calls.filter(([arg]) => arg.method === 'eth_requestAccounts')).toHaveLength(before);
  expect(wrong.request).not.toHaveBeenCalled();
  rememberWallet({ ...selected, rdns: 'io.missing' });
  expect(await restoreWallet()).toBeNull();
  unsubscribe();
  stop();
  localStorage.clear();
  expect(provider.removeListener).toHaveBeenCalledTimes(3);
});
