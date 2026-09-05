import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusTimeline } from './StatusTimeline';

describe('StatusTimeline', () => {
  afterEach(cleanup);
  it('announces the current proof stage', () => {
    render(<StatusTimeline status="preflight" />);
    expect(screen.getByText('preflight').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it.each(['refused', 'failed'] as const)('does not invent reached stages for %s', (status) => {
    const { container } = render(<StatusTimeline status={status} />);
    expect(screen.getByText(status).closest('li')).toHaveAttribute('aria-current', 'step');
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(container.querySelectorAll('.reached')).toHaveLength(0);
    expect(screen.getByText('executed').closest('li')).not.toHaveAttribute('aria-current');
  });
});
