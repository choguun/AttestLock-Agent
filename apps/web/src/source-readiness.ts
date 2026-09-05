import { Contract, parseUnits } from 'ethers';
import { mockUsdcAbi } from '@attestlock/shared';
import { config } from './config';
import type { WalletSession } from './wallet';

export interface SourceReadiness {
  claimed: boolean;
  balance: bigint;
  allowance: bigint;
  gas: bigint;
}

export async function boundedWalletRead<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Wallet read timed out')), 8_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readSourceReadiness(session: WalletSession): Promise<SourceReadiness> {
  const token = new Contract(config.mockUsdcAddress, mockUsdcAbi, session.signer);
  const [claimed, balance, allowance, gas] = await boundedWalletRead(
    Promise.all([
      token.getFunction('faucetClaimed')(session.address) as Promise<boolean>,
      token.getFunction('balanceOf')(session.address) as Promise<bigint>,
      token.getFunction('allowance')(session.address, config.lockVaultAddress) as Promise<bigint>,
      session.provider.getBalance(session.address),
    ])
  );
  return { claimed, balance, allowance, gas };
}

export function sourceActions(state: SourceReadiness | null) {
  const amount = parseUnits('100', 6);
  return {
    faucet: !!state && !state.claimed && state.gas > 0n,
    approve: !!state && state.balance >= amount && state.allowance < amount && state.gas > 0n,
    lock: !!state && state.balance >= amount && state.allowance >= amount && state.gas > 0n,
  };
}
