import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('AttestLock judge flow', () => {
  it('fails closed in preview mode and never presents target credit as live state', () => {
    render(<App />);
    expect(screen.getByText(/judge-safe preview mode/i)).toBeInTheDocument();
    expect(screen.getByText('Maximum credit').parentElement).toHaveTextContent('— mUSD');
    expect(screen.getByRole('button', { name: 'Lock + prove' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prove it fails' })).toBeDisabled();
  });

  it('exposes labelled transaction controls and a live status region', () => {
    render(<App />);
    expect(screen.getByLabelText('Sepolia transaction hash')).toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2);
  });
});
