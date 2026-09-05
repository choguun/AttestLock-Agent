import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JudgeEvidence, parseJudgeArtifact } from './JudgeEvidence';
import nativeEvidence from '../public/evidence/verified.json';

describe('wallet-free evidence', () => {
  it('does not certify missing or partial chain evidence', () => {
    for (const value of [null, {}, { schemaVersion: 1, proofArguments: [] }])
      expect(() => parseJudgeArtifact(value)).toThrow();
    render(<JudgeEvidence />);
    expect(screen.getByText(/No verified example has been published yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Download sanitized/)).not.toBeInTheDocument();
  });
  it('labels a native origination snapshot partial and never promotes it to complete', () => {
    expect(parseJudgeArtifact(nativeEvidence).acceptanceStage).toBe('native-origination');
    expect(() => parseJudgeArtifact({ ...nativeEvidence, acceptanceStage: 'complete' })).toThrow();
    expect(() => parseJudgeArtifact({ ...nativeEvidence, acceptanceStage: 'made-up' })).toThrow();
    const missingReplay = structuredClone(nativeEvidence);
    delete (missingReplay.transactions as Record<string, unknown>).duplicateQuery;
    expect(() => parseJudgeArtifact(missingReplay)).toThrow();
  });
});
