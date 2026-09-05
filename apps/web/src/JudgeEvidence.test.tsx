import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JudgeEvidence, parseJudgeArtifact } from './JudgeEvidence';
import nativeEvidence from '../public/evidence/verified.json';

describe('wallet-free evidence', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('does not certify missing or partial chain evidence', () => {
    for (const value of [null, {}, { schemaVersion: 1, proofArguments: [] }])
      expect(() => parseJudgeArtifact(value)).toThrow();
    render(<JudgeEvidence />);
    expect(screen.getByText(/No verified example has been published yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Download sanitized/)).not.toBeInTheDocument();
  });
  it('keeps borrower draw evidence partial until repayment is actually supplied', () => {
    expect(parseJudgeArtifact(nativeEvidence).acceptanceStage).toBe('borrow-demonstrated');
    expect(() => parseJudgeArtifact({ ...nativeEvidence, acceptanceStage: 'complete' })).toThrow();
    expect(() => parseJudgeArtifact({ ...nativeEvidence, acceptanceStage: 'made-up' })).toThrow();
    expect(() => parseJudgeArtifact({ ...nativeEvidence, acceptanceStage: undefined })).toThrow();
    const missingReplay = structuredClone(nativeEvidence);
    delete (missingReplay.transactions as Record<string, unknown>).duplicateQuery;
    expect(() => parseJudgeArtifact(missingReplay)).toThrow();
    const missingDraw = structuredClone(nativeEvidence);
    delete (missingDraw.transactions as Record<string, unknown>).borrow;
    expect(() => parseJudgeArtifact(missingDraw)).toThrow();
    expect(
      parseJudgeArtifact({ ...missingDraw, acceptanceStage: 'native-origination' }).acceptanceStage
    ).toBe('native-origination');
  });
  it('renders the real draw link and explicitly pending repayment without a wallet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => nativeEvidence }))
    );
    render(<JudgeEvidence />);
    expect(await screen.findByText(/borrower signed a 50 mUSD draw/)).toBeInTheDocument();
    expect(screen.getByText(/Post-maturity repayment, the full browser onboarding/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /borrow: block 5434865/ })).toHaveAttribute(
      'href',
      'https://creditcoin-testnet.blockscout.com/tx/0xb631739d1a05410e3ca6a26b88de068ea514cec1d18b758d8aebde49e684dba4'
    );
    for (const name of ['lock', 'junk'] as const) {
      expect(screen.getByRole('link', { name: new RegExp(`^${name}: block`) })).toHaveAttribute(
        'href',
        `https://eth-sepolia.blockscout.com/tx/${nativeEvidence.transactions[name].hash}`
      );
    }
    expect(screen.getByText(/50000000 borrowed/)).toHaveTextContent(
      '50000000 borrowed − 0 repaid = 50000000 debt.'
    );
  });
});
