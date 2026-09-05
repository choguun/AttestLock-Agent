import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JudgeEvidence, parseJudgeArtifact } from './JudgeEvidence';

describe('wallet-free evidence', () => {
  it('does not certify missing or partial chain evidence', () => {
    for (const value of [null, {}, { schemaVersion: 1, proofArguments: [] }])
      expect(() => parseJudgeArtifact(value)).toThrow();
    render(<JudgeEvidence />);
    expect(screen.getByText(/No verified example has been published yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Download sanitized/)).not.toBeInTheDocument();
  });
});
