import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusTimeline } from './StatusTimeline';

describe('StatusTimeline', () => {
  it('announces the current proof stage', () => {
    render(<StatusTimeline status="preflight" />);
    expect(screen.getByText('preflight').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('renders a deterministic refusal terminal', () => {
    render(<StatusTimeline status="refused" />);
    expect(screen.getByText('refused')).toBeVisible();
  });
});
