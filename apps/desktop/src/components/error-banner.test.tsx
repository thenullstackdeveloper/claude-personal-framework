import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CliError } from '../lib/api';
import { ErrorBanner } from './error-banner';

const sampleError: CliError = { code: 'X', message: 'something broke' };

describe('<ErrorBanner />', () => {
  it('renders the title and the error message', () => {
    render(<ErrorBanner title="Catalog load failed" error={sampleError} onDismiss={() => {}} />);
    expect(screen.getByText('Catalog load failed')).toBeInTheDocument();
    expect(screen.getByText('something broke')).toBeInTheDocument();
  });

  it('invokes onDismiss when the Dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<ErrorBanner title="Status check failed" error={sampleError} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
