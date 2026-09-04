import { describe, expect, it } from 'vitest';
import { canBorrowLine, chainLabel, walletErrorMessage, type CreditLineView } from './wallet';

describe('wallet presentation helpers', () => {
  it('normalizes rejected and provider errors', () => {
    expect(walletErrorMessage({ code: 4001, message: 'raw provider message' })).toBe(
      'Wallet request was rejected.'
    );
    expect(walletErrorMessage({ shortMessage: 'insufficient funds' })).toBe('insufficient funds');
  });

  it('labels supported and unsupported networks', () => {
    expect(chainLabel(11_155_111)).toBe('Sepolia');
    expect(chainLabel(102_031)).toBe('Creditcoin testnet');
    expect(chainLabel(1)).toBe('Unsupported (1)');
  });

  it('gates borrowing by borrower, network, capacity, maturity, and lock evidence', () => {
    const address = '0x1111111111111111111111111111111111111111';
    const line: CreditLineView = {
      borrower: address,
      limit: '50.0',
      debt: '0.0',
      maturity: Math.floor(Date.now() / 1000) + 3_600,
      collateralAmount: '100.0',
      collateralUnlockAt: Math.floor(Date.now() / 1000) + 7_200,
    };
    expect(canBorrowLine(address, 102_031, `0x${'11'.repeat(32)}`, line)).toBe(true);
    expect(
      canBorrowLine('0x2222222222222222222222222222222222222222', 102_031, `0x${'11'.repeat(32)}`, line)
    ).toBe(false);
    expect(canBorrowLine(address, 1, `0x${'11'.repeat(32)}`, line)).toBe(false);
    expect(canBorrowLine(address, 102_031, undefined, line)).toBe(false);
    expect(canBorrowLine(address, 102_031, `0x${'11'.repeat(32)}`, { ...line, debt: '50.0' })).toBe(false);
    expect(canBorrowLine(address, 102_031, `0x${'11'.repeat(32)}`, { ...line, maturity: 1 })).toBe(false);
  });
});
